# Tasks

## 0. Starting point

- [x] 0.1 Run `npm run eval:check` on the current `main` and keep `eval/reports/latest.md` as the `before` report. Verify that it passes against the committed baseline.

## 1. Entry checks and the list module

- [x] 1.1 Create `src/autocorrect/list-checks.ts`: a pure `checkEntry(entry, lang, isCorrect, customWords)` that returns the failed checks (typo rejected, fix accepted, same script, single words that differ, English ≥ 3 letters, not a custom word), and `alefForms(word)` for the Arabic alef-form check (design D4). Add `parseList(text)` (TSV lines, an optional Arabic `not:` column of acknowledged spellings, `#` comments, duplicate detection). The alef check fails on unacknowledged accepted spellings and on stale acknowledgements (design D4). Verify with `test/autocorrect/list-checks.test.ts` using a fake `isCorrect`: each failure is reported by name; `alefForms('ان')` includes "أن" and "إن"; "اذا" passes with "أذا" acknowledged and fails without; a stale acknowledgement fails; duplicates are detected.
- [x] 1.2 Create `src/autocorrect/misspellings.ts` with `knownFix(word, lang)` over the parsed lists. English matches lower-case or first-capital words; Arabic matches after `stripMarks`. Start with empty project lists. Verify with `test/autocorrect/misspellings.test.ts` on a small inline list: "teh" and "Teh" match, "tEh" and "TEH" don't, and "الىٰ" matches "الى".

## 2. AyaSpell entries

- [x] 2.1 Write `scripts/extract-ayaspell-rep.ts`. It reads the anchored `REP ^…$` rules from `dicts/ar/ar.aff`, leaves out multi-word targets, runs `checkEntry` against the real engine with the acknowledgements from the hand-maintained `AYASPELL_NOT` table, and writes `src/autocorrect/lists/ar.ts`'s `AR_AYASPELL` block with a provenance header (source `dicts/ar/ar.aff`, MPL 1.1, see `dicts/ar/NOTICE`) and a comment for every entry it leaves out. Run it. Fill `AYASPELL_NOT` with the artifact spellings for اذا, او, الى and الذى (marked for review). Verify that the block contains اذا, فى, او, هى, انتما, الى, الذى and التى, and leaves out "انت" (accepted as written) and "إنشاء_الله" (phrase), each with its reason.
- [x] 2.2 Add a drift test to `test/autocorrect/misspellings.test.ts`: re-derive the rules from `ar.aff` and compare them with `AR_AYASPELL` plus its recorded omissions. Verify that it passes, and that editing one entry by hand makes it fail.

## 3. Draft the project lists

- [x] 3.1 Draft `EN_PROJECT` in `src/autocorrect/lists/en.ts` (about 300 entries, design D8: no eval datasets consulted, no en-GB/en-US pairs, no names), with the header "source: written for this project; human review: pending". Verify by running the entry checks (3.3) and removing or fixing every failure. Record the final count.
- [x] 3.2 Draft `AR_PROJECT` in `src/autocorrect/lists/ar.ts` (about 100 entries: missing hamza on frequent words, plus ى/ي and ة/ه only where the checks prove the result unambiguous), with the same header. Verify the same way, and record the final count and how many entries the alef-form check removed.
- [x] 3.3 Add the full-list test to `test/autocorrect/misspellings.test.ts`. It runs `checkEntry` on every entry of every list against the real engine, with the custom words from `eval/datasets/custom-words.txt`, and reports all failures at once. Verify that it passes, and that adding "ان\tأن" or "ot\tto" makes it fail with the entry's name. Every `not:` acknowledgement in the draft is listed in KI-5 for the reviewer.

## 4. Confidence rule and composer

- [x] 4.1 Change `decide()` to check the list first, take `ctx.confidence`, and return `{ fix, source }` (design D3). Verify with `test/autocorrect/confidence.test.ts`:
  - teh → the (list), Teh → The, TEH unchanged;
  - اذا → إذا, الى → إلى, and ان left alone;
  - at `list`: teh fixed, paymnet and المستخذم not;
  - list entries still respect the ignore list and the custom dictionary;
  - the sources are `list`, `case` and `neighbor`;
  - all existing cases still pass with the new return shape.
- [x] 4.2 Update `corpus.test.ts` and `custom-words.test.ts` for the new return shape and the list. Re-pin the exact EN and AR fix sets: teh and the common Arabic hamza slips should now be fixed. Verify that they pass with "no wrong fix" still enforced.
- [x] 4.3 In `src/composer/attach.ts`: add an `autoReplace` option, pass it to `decide`, skip the neighbors request and the case check when `knownFix` hits or the level is `list`, and put the list fix first in `showSuggestions()` (design D5). Verify with `test/composer/autocorrect.test.ts` and `attach.test.ts`:
  - "teh " → "the ";
  - "اذا كان" → "إذا كان";
  - at `list`: "teh paymnet " → "the paymnet ";
  - after a revert, "teh " stays unchanged;
  - in `suggest` mode, the popover on "teh" lists "the" first, and on "الى" lists "إلى" first, with `dir="rtl"`;
  - no neighbors request is sent for a list word.
- [x] 4.4 Update `src/autocorrect/README.md` and `src/composer/README.md` (rule order, the list, the confidence level). Verify that they match `decide()` and the delta specs.

## 5. Policy and demo settings

- [x] 5.1 Add `autoReplace` to `AdminPolicy`, `DEFAULT_POLICY` and `parsePolicy` in `src/policy/index.ts`. Verify with `test/policy/policy.test.ts`: the default is `list-and-rule`, missing or unknown values fall back to it, and `list` round-trips.
- [x] 5.2 Add the "Auto-replace confidence" select to `index.html` and wire it in `src/demo/settings.ts` (read, write, presets, reset, effective-settings line) and `src/demo/main.ts` (pass it to `attachSpellCheck`). Verify with `test/demo/settings.test.ts`: the select reflects the stored policy, Apply stores it, Reset restores `list-and-rule`, and the effective line names the level.
- [x] 5.3 Manual check on the demo page: covered by 4.3 (composer: teh, اذا كان, list-only, popover order and direction) and 5.2 (settings panel: select, effective line, presets, reset, persistence), using the task's fallback as decided for `autocorrect-reliability` (October 5, 2026). The visual check is left to testers through `docs/TESTING.md`.

## 6. Eval

- [x] 6.1 Thread the source through `eval/pipeline.ts` (`replacementSource`, the list fix first in `suggestions`, an `autoReplace` option defaulting to `list-and-rule`), `eval/outcomes.ts` and `eval/types.ts` (`source`). Verify with `test/eval/pipeline.test.ts` ("teh" replaced with source `list`, "seperate" with `neighbor`, "oNly" with `case`) and `test/eval/parity.test.ts`, with "teh" and "اذا كان" added to its messages so the composer and the pipeline still agree.
- [x] 6.2 Add `bySource()` to `eval/metrics.ts`, the "Auto-replace by source" table to `eval/report.ts`, and the per-source figures to the baseline JSON for information only (`eval/gate.ts` doesn't compare them). Verify with the spec's breakdown scenario in `test/eval/metrics.test.ts`, and with a report test that shows the table.
- [x] 6.3 Update `docs/EVALUATION.md` (the by-source table, and the caveat that the curated typo sets overlap with the list). Verify that it matches the `spelling-eval` delta.
- [x] 6.4 Run `npm run eval:check` against the old baseline. Verify:
  - no regression in precision or corruption;
  - every new corruption or wrong-fix identity is reviewed (fix the list entry if it's the cause);
  - decision instability stays 0;
  - the by-source table shows the list's contribution.

  Then run `npm run eval:baseline` and add a short "Baseline after `autocorrect-misspellings-list`" section to `docs/EVALUATION.md`.

## 7. Docs and known issues

- [x] 7.1 Add KI-5 to `docs/known-issues.md`: the human review of `EN_PROJECT` and `AR_PROJECT` (fluent Arabic for the latter) is pending, with steps to close it (review, fix entries, run `npm test` and `eval:check`, change the headers to name the reviewer and the date). Verify that the headers and KI-5 agree.
- [x] 7.2 Update `docs/TESTING.md`:
  - "teh␣" → "the" and "Teh␣" → "The";
  - "اذا كان" → "إذا كان" (T2.14 moves to "changes");
  - "الى" → "إلى";
  - "ان␣" and "TEH␣" must not change;
  - "afte␣" stays the ambiguous English example;
  - a new scenario for "Misspellings list only";
  - remove "hamza slips are planned for a later version" from the known limitations.

  Verify that it matches the `tester-kit` delta.
- [x] 7.3 Update `docs/requirements/gap-analysis-60145-60254.md`: Req 4.2 ("teh" now fixed), Req 4.2.3 (misspellings list and confidence level), and the proposed-changes list. Verify that the rows and the list are consistent.

## 8. Integration

- [x] 8.1 Run `npm run typecheck`, `npm test` and `npm run build`. Verify that all pass.
- [x] 8.2 Run `openspec validate autocorrect-misspellings-list --strict`. Verify that it passes.
