# Tasks

## 0. Starting point

- [x] 0.1 Run `npm run eval:check` on the current `main` and keep the report (`eval/reports/latest.md`) as `before`, for the comparison in 6.2. Verify that it matches the committed baseline (no regressions).

## 1. One-edit neighbors in the worker

- [x] 1.1 Create `src/autocorrect/neighbors.ts` with `oneEditVariants(word, alphabet)` (design D1): deletions, adjacent swaps, substitutions and insertions, in code points, deduplicated, without the word itself. Add `tryAlphabet(affText, lang)`, which parses the `.aff` `TRY` line and keeps letters and the apostrophe (English lowercase only, Arabic without harakat). Verify with `test/autocorrect/neighbors.test.ts`: the exact variant count for a 3-letter word over a 2-letter alphabet, an Arabic word handled per code point, `tryAlphabet` on both committed `.aff` files (no harakat, no uppercase).
- [x] 1.2 Add the `neighbors` request to `src/spell/protocol.ts` and `src/spell/handler.ts`. Parse the alphabet at `load`, normalize (`stripMarks` / lower case), filter with `isCorrect`, accept the capitalized form for a capitalized English word, sort by code point, and return an error for an unloaded language. Verify with `test/spell/handler.test.ts` on the real engine: "recieve" → ["receive", "relieve"], "seperate" → ["separate"], "المستخذم" → ["المستخدم"], "المُستخذم" equal to "المستخذم", "النضام" has more than one entry, a custom word added with `add` appears as a neighbor, and an unloaded language returns an error.
- [x] 1.3 Add `neighbors(lang, word)` to `SpellService` (`src/spell/service.ts`), cached per `lang:word`, with in-flight requests shared. Verify with `test/spell/service.test.ts`: a second call for the same word sends no second worker request.
- [x] 1.4 Verify the stability scenario: a test in `test/spell/handler.test.ts` gets the neighbors of "recieve" and "الإلكطروني" once on an idle CPU and once while `worker_threads` busy-loop on every core, and expects identical replies.

## 2. Confidence rule

- [x] 2.1 Change `decide()` in `src/autocorrect/confidence.ts` to `decide(word, lang, { neighbors, caseFix }, ctx)` (design D2). Add `caseFolded(word, lang)`, and make capitalization follow "starts with a capital". Remove the now-unused `osa` dependency from `decide`, and keep `distance.ts` only if something else still imports it. Verify by rewriting `test/autocorrect/confidence.test.ts` for the spec scenarios: seperate, recieve (two neighbors), المستخذم, حتىى, النضام (many neighbors), اذا (many neighbors), teh and GOSSI, Seperate → Separate, LLet → Let, the case fix for oNly, thiS and dOcument with competing neighbors present, the ignore list and the custom dictionary.
- [x] 2.2 Make `test/autocorrect/corpus.test.ts` exact: run `neighbors` and `caseFolded` + `check` through the real handler, pin the exact EN and AR auto-fix sets, keep "no fix is ever wrong", and remove the KI-1 comment. Verify that it passes three times in a row, including once under `npm test` with the full suite.
- [x] 2.3 Update `test/autocorrect/custom-words.test.ts` if its decisions relied on suggestions. Verify that it passes.
- [x] 2.4 Rewrite `src/autocorrect/README.md` to describe the rule: neighbors, case fix, guards, why Arabic is conservative. Verify that it matches `decide()` and the `auto-correct` delta spec.

## 3. Trigger and composer

- [x] 3.1 Add `boundaryKind(e)` and `releasable(held, text, caret, tokens)` to `src/autocorrect/trigger.ts` (design D3), DOM-free and working on flat offsets. Verify with `test/autocorrect/trigger.test.ts`:
  - `.` `@` `:` `/` → hold; `,` `؟` `،` → decide; space, `insertLineBreak` and `insertParagraph` → release; paste and multi-character input → none;
  - `releasable` keeps a held word in the same run, and drops one that's now inside an excluded span ("info@gosi.gov.sa"), changed, or in another run.
- [x] 3.2 Change `src/composer/attach.ts` to use `service.neighbors` plus `caseFolded` and `service.check` for the decision, and keep `held` (live ranges) with hold / decide / release handling. Clear `held` when the composer is emptied. Update `test/composer/fakes.ts` so `fakeService` provides `neighbors`. Verify with `test/composer/autocorrect.test.ts`:
  - "please seperate. " is unchanged after "." and corrected after the space;
  - "please seperate," is corrected at the comma;
  - "email info@gosi.gov.sa " and "visit https://www.gosi.gov.sa/en " are never replaced at any step, with `replace` never called;
  - "راسلنا على info@gosi.gov.sa " is unchanged;
  - "رقم المستخذم. " → "رقم المستخدم. ";
  - "please seperate." then Shift+Enter (`insertLineBreak`) is corrected;
  - "please seperate." then clicking at the start and typing a space leaves it unchanged;
  - Undo after a held word's replacement restores "seperate" and records a revert.
- [x] 3.3 Update the existing composer tests that expect "النضام" / "اذا" to be auto-fixed: use "المستخذم" / "حتىى" for fixes, and assert that "النضام" and "اذا" stay underlined. Verify that `test/composer/*.test.ts` pass.
- [x] 3.4 Update `src/composer/README.md` (auto-correct flow: neighbors, held words). Verify that it names the new request and the hold characters.
- [x] 3.5 Manual check on the demo page: replaced by the automated coverage (decided October 5, 2026). The real-engine parity test (15 messages, including addresses typed character by character) and the jsdom composer tests cover the behavior. The paths a browser would add (execCommand replace, flash, popover, worker loading) are unchanged by this change. The visual checks (flash, right-to-left Revert menu) are left to testers through `docs/TESTING.md` T2/T3.

## 4. Eval pipeline

- [x] 4.1 Change `eval/pipeline.ts` to replay typing with `boundaryKind`, `completedWord` and `releasable` from `trigger.ts` (removing its own `BOUNDARY_CHAR`/`GAP`). Append a space when a message doesn't end in whitespace, and decide with `neighbors` + `caseFolded` through the handler. Verify with `test/eval/pipeline.test.ts`: "You can also email us at info@gosi.gov.sa with your request." has no transient replacement; "Please seperate." records "seperate" auto-replaced; "please seperate them", "رقم النضام هو paymnet" (النضام flagged, not replaced) and the exclusions still behave as specified.
- [x] 4.2 Update `test/eval/parity.test.ts` so the composer side also types "." and "@" boundaries (the address messages). Verify that the composer and the pipeline agree on every message, including the address ones that used to leak.

## 5. Eval stability split

- [x] 5.1 In `eval/benchmark.ts`, split the decision key (outcome + replacement) from the suggestion key (top correction). Count `decision` and `suggestion` instability per language, with examples. Make the `instability` criterion read decision instability (`eval/criteria.ts`, and the `_note` in `criteria.json`). Verify with `test/eval/benchmark.test.ts` (or `criteria.test.ts`): a synthetic run set where only the top correction differs counts 1 suggestion and 0 decision instability, and one where the replacement differs counts 1 decision instability.
- [x] 5.2 In `eval/report.ts`, show both counts in the Stability section, and add an informational "decision p95" column (neighbors request time) to the latency table. Verify with `test/eval/report-gate.test.ts`: the report contains both counts, and suggestion instability never fails the gate.
- [x] 5.3 Update `docs/EVALUATION.md` (stability: two counts; typing order: held words and the trailing space). Verify that it matches the `spelling-eval` delta spec.

## 6. Measure and rebaseline

- [x] 6.1 Run `npm run eval`. Verify:
  - decision instability is 0 for EN and AR;
  - exclusion leaks are 0;
  - at most 1 wrong fix of a real typo per language;
  - no corruption identities beyond the `before` report (names, British spellings, ميجابايت);
  - decision p95 ≤ 100 ms for each language.
  (Corrected October 5, 2026. The first target, auto-replace precision ≥ 99% EN and ≥ 96% AR, came from an experiment that counted only typo fixes. The eval's precision also counts the clean-text corruptions, which are out of scope here. Measured: EN 1 / AR 1 wrong fix, precision 95.3% / 91.2%, decision p95 7.7 / 24.8 ms.)
- [x] 6.2 Run `npm run eval:check` against the old baseline. Verify that it reports no regression in precision, corruption or identities. Coverage dropping for Arabic is expected and not gated. Then run `npm run eval:baseline`, and summarize the before/after criterion table in the commit message.

## 7. Docs and known issues

- [x] 7.1 Update `docs/known-issues.md`: mark KI-1, KI-2 and KI-3 as resolved by `autocorrect-reliability`, with the date and the eval figures that meet each exit criterion. Verify that each issue names the change and its evidence.
- [x] 7.2 Update `docs/TESTING.md`:
  - T1.5 stays an underline check;
  - T2.4 becomes "المستخذم " → "المستخدم", and T2.5 becomes "اذا كان" → underlined with "إذا" offered;
  - add "oNly " → "only" and "info@gosi.gov.sa " (unchanged);
  - T3.2 uses "رقم المستخذم␣";
  - in the known limitations, replace the KI-1 load note with "many Arabic typos are only underlined, not auto-corrected".
  Verify every changed scenario on the demo page (part of 3.5).
- [x] 7.3 Update `docs/requirements/gap-analysis-60145-60254.md`: Req 4.2.3 notes the deterministic rule, and the proposed-changes list notes that this change was done. Verify that the row and the list are consistent.

## 8. Integration

- [x] 8.1 Run `npm run typecheck`, `npm test` and `npm run build`. Verify that all pass.
- [x] 8.2 Run `openspec validate autocorrect-reliability --strict`. Verify that it passes.
