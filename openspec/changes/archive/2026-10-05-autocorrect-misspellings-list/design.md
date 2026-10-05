# Design

## Context

After `autocorrect-reliability`, `decide(word, lang, { neighbors, caseFix }, ctx)` in `src/autocorrect/confidence.ts` is pure and deterministic. The composer (`src/composer/attach.ts`) gathers the evidence: a `check` for the case-folded form, then the worker's `neighbors` request. The eval pipeline (`eval/pipeline.ts`) mirrors this. The popover's suggestions come straight from `service.suggest()`.

AyaSpell's `ar.aff` declares 10 anchored whole-word `REP` rules (`REP ^اذا$ إذا` …). Checked against the engine:
- "انت" is accepted as written, so its rule could never fire;
- "إنشاء_الله" is a phrase, not a single word.

A further check showed that "ان" is rejected but ambiguous ("أن" or "إن"), and that "امس" and "مساعده" are accepted as written. So both the AyaSpell entries and our own need automatic checks, not only review.

## Goals / Non-Goals

**Goals:**
- One pure lookup, `knownFix(word, lang)`, used identically by the composer, the popover and the eval.
- Lists that can be reviewed by a person: plain `typo<TAB>fix` lines with a provenance header.
- Every entry is machine-checked against the committed engine, so a bad entry fails `npm test`.

**Non-Goals:**
- Loading lists at runtime from the network or from the server.
- Any worker or protocol change.
- Per-tenant list editing.

## Decisions

### D1. Lists are TypeScript modules holding TSV text (Tier 1, page bundle)

- `src/autocorrect/lists/en.ts` exports `EN_PROJECT` (this project's entries).
- `src/autocorrect/lists/ar.ts` exports `AR_PROJECT` and `AR_AYASPELL`.

Each export is a template string of `typo\tfix` lines. An Arabic line may have a third column, `not: <spelling> …`, acknowledging alef-form spellings that the dictionary accepts but that aren't plausible fixes (D4). A comment header gives the source, the license or ownership, and "human review: pending". `src/autocorrect/misspellings.ts` parses them once into `Map`s and exports `knownFix(word, lang): string | null`.

- *Why TS modules:* the same import works in the Vite bundle, in Vitest, and in plain Node through `eval/register.ts`. JSON import attributes or Vite's `?raw` would each break one of the three.
- *Why not the worker:* the decision and the popover are page-side, and the data is a few KB. Putting it in the worker would add a request and a round trip for nothing.

Matching:
- **English:** if the word is all lower case, or only its first letter is upper case, look up its lower-case form. Mixed case such as "tEh" is left to the case-fix rule. All caps is excluded by `decide()`'s guard anyway.
- **Arabic:** look up `stripMarks(word)`.

### D2. AyaSpell entries are extracted by a script and checked for drift

`scripts/extract-ayaspell-rep.ts` reads the anchored rules `^…$` from `dicts/ar/ar.aff` and writes `AR_AYASPELL`. It leaves out multi-word rules (an `_` in the target) and records each one it leaves out as a comment with the reason. Entries that fail the checks are recorded the same way (D4). Acknowledgements for AyaSpell rules live in a hand-maintained `AYASPELL_NOT` table in `ar.ts`, outside the generated block, and the script applies them when it checks. The script runs directly with Node, like `scripts/fetch-dicts.ts`.

A test re-derives the rules from `ar.aff` and compares them with the committed module, so a dictionary update can't silently desync the list.

- *Alternative rejected:* parsing `ar.aff` at runtime in the worker. That needs a new worker request, and it hides the entries from review.

### D3. `decide()` checks the list first, and reports its source (Tier 1, page)

New signature: `decide(word, lang, evidence, ctx)`, which returns `{ fix, source } | null`, where `source` is `'list' | 'case' | 'neighbor'`.

- `ctx` gains `confidence: 'list' | 'list-and-rule'`.
- Order:
  1. Guards: ignore list, custom dictionary, all caps.
  2. `knownFix` → `list`.
  3. If `confidence === 'list'`, return null.
  4. Minimum length.
  5. `caseFix` → `case`.
  6. Single neighbor → `neighbor`.
- A leading capital carries over in every case.

`evidence.neighbors` may be empty when the caller skipped the request. The composer and the pipeline skip both the `neighbors` request and the case check when `knownFix` hits or the confidence is `list`, so no worker work is wasted.

- *Why return the source:* the eval breakdown needs it, and it costs nothing. `attach.ts` only uses `.fix`.

### D4. Entry checks are one test on the real engine, with acknowledged alternatives

`test/autocorrect/misspellings.test.ts` loads both dictionaries through the handler, as `corpus.test.ts` does, and runs the spec's checks for every entry, collecting all failures into one message.

The Arabic alef-form check builds every combination of ا أ إ آ at the alef positions of the misspelled word. That's 4^k combinations, where k is the number of alef positions, usually 3 or fewer. Each combination the engine accepts, other than the fix, must be acknowledged in the entry's `not:` column, and each acknowledged spelling must still be accepted.

- *Why acknowledgements:* during implementation, the strict form ("no other alef spelling may be a word") turned out to reject almost every hamza entry. Hunspell's Arabic morphology accepts "أذا" (question prefix + "ذا"), "ألتأمينات", "آلى" and the like. Only a person can tell these artifacts from real alternatives such as "إن", "إمام", "أذن" or "أسف". So the check lists the alternatives and the reviewer decides. Nothing passes silently, and a dictionary update that adds a new alternative fails the test.
- *Alternative rejected:* filtering "أ + accepted word" automatically. It's fragile (it misses "آلى" and "إلان") and could hide a real ambiguity.

`scripts/extract-ayaspell-rep.ts` runs the same checks (shared in `src/autocorrect/list-checks.ts`, a pure function over an `isCorrect` callback) to decide which AyaSpell entries to keep.

### D5. The popover puts the list fix first (Tier 1, page)

`showSuggestions()` in `attach.ts` becomes `known ? [known, ...suggestions.filter((s) => s !== known)] : suggestions`. The pipeline does the same for `TokenResult.suggestions`, so correction@1 measures what the agent sees.

### D6. Confidence level: policy → attach → decide (config, Tier 1)

- `AdminPolicy.autoReplace: 'list' | 'list-and-rule'`, defaulting to `list-and-rule`. `parsePolicy` falls back field by field, as it does today. Agents can't change it, so `resolveMode` is untouched.
- `AttachOptions.autoReplace` is passed through to `decide`'s context.
- The demo adds a `<select name="autoReplace">` to the admin settings. `settings.ts` reads and writes it, `main.ts` passes it to `attachSpellCheck`. The presets leave it at the default, and "Reset" restores it.
- `PipelineOptions.autoReplace` defaults to `list-and-rule`, so the eval measures the default.

### D7. Eval records the source

- `TokenResult` and `TransientReplacement` gain `replacementSource`, and `WordOutcome` gains `source: 'list' | 'case' | 'neighbor' | null`.
- `computeMetrics` stays as it is. A new `bySource(outcomes)` computes precision, coverage and counts per source.
- The report adds a table, "Auto-replace by source", per language.
- The baseline JSON stores the per-source figures for information only. The gate doesn't compare them.

### D8. How the lists are drafted

The English list targets typing slips seen across general English: adjacent swaps in frequent short words ("teh", "adn", "taht", "wiht"), dropped or doubled letters in frequent words, and well-known misspellings ("recieve", "definately"). I draft it from general knowledge, **without consulting the eval datasets**.

The Arabic project list targets missing hamza on frequent words. It also covers ى/ي and ة/ه confusions, but only where the checks prove the result unambiguous.

Both lists exclude:
- en-GB/en-US variant pairs;
- names, product names and transliterations;
- anything in `eval/datasets/custom-words.txt`.

### Undo, editable DOM, RTL

There's no new text-change path. List fixes go through `autoCorrect()` → `env.replace` (one undo step), with the flash, Revert and the ignore list as today. The popover's direction logic is unchanged. Nothing is written into the editable DOM.

## Risks / Trade-offs

- **A list entry is wrong in context.** For example, a typo that is a legitimate transliteration in GOSI text, which auto-correct would then change silently. → Human review (KI-5) before testers see it. The custom dictionary and revert still override it, and the eval's clean-text corruption count is gated with zero tolerance.
- **The eval overstates coverage.** The curated `typos-*` sets contain classic misspellings, and so will the list. → The by-source table makes the list's share visible, and the `injected-*` sets and the matrix are generated by random edits. The docs say so.
- **The lists drift from the dictionary.** → The checks run in `npm test` on every dictionary pin change, and the AyaSpell drift test fails if `ar.aff` changes.
- **`list` confidence surprises an admin.** Fewer fixes than expected. → The setting labels say what each level does, and the demo's effective-settings line shows the level.

## Migration Plan

- A stored demo policy without `autoReplace` parses to `list-and-rule`, so behavior only widens: the list adds fixes, and nothing that was replaced before stops being replaced.
- Run `npm run eval:check` against the current baseline. Expect higher coverage. Precision and corruption must not get worse, and any new corruption identity is reviewed. Then run `eval:baseline`.
- Rollback is a revert.

## Open Questions

- The final size of each list depends on how many drafted entries pass the checks and the review. The ~300 / ~100 targets are estimates, and nothing else depends on them.
