# Known issues

## KI-1: Auto-correct confidence depends on Hunspell's time-limited suggestions

**Status:** resolved October 5, 2026 by the `autocorrect-reliability` change (option 1 below). The decision now counts every dictionary word one edit away, checked with `spell()` in the worker (the `neighbors` request), with no time limit. The benchmark measures decision instability 0 for English and Arabic, including the run under CPU load (it was 1 and 13 on the same machine that day), and `npm run eval:check` passes. Popover suggestions still come from the time-limited `suggest()`. Their order can change under load: 2 Arabic tokens in that run, reported as suggestion instability without a gate. Vitest keeps `fileParallelism: false` for that reason.

**Original status:** open, deferred (decided October 2, 2026, during the `auto-correct` change). Address before GOSI enables `auto` mode in production.

**What happens.** The auto-correct confidence rule (`src/autocorrect/confidence.ts`) fixes a word only when *exactly one* engine suggestion is a single edit away. It reads those suggestions from Hunspell's `suggest()`, which stops generating candidates after fixed time budgets: `TIMELIMIT_SUGGESTION_MS` (100 ms per stage) and `TIMELIMIT_GLOBAL_MS` (250 ms in total), defined in Hunspell's `src/hunspell/atypes.hxx`. On a busy or slow machine the list comes back shorter. If a competing one-edit candidate is cut, an ambiguous word looks unambiguous, so **auto-correct gets more aggressive under CPU load**. Even without load, `suggest()` ranks and prunes; it doesn't guarantee to list every dictionary word one edit away.

**Evidence.**
- The Arabic typo corpus (`test/autocorrect/corpus.test.ts`) gave 5 auto-fixes when run alone and 6 inside the full parallel test suite. The extra fix happened to be correct.
- Suggestions shown in the popover are affected too: under parallel test load, "GOSSI" sometimes got only `["GOSSIP"]` and lost the custom word "GOSI" (`test/autocorrect/custom-words.test.ts`).

**Current mitigation.**
- Vitest runs test files serially (`fileParallelism: false` in `vite.config.ts`), so real-engine tests aren't starved of CPU.
- The corpus test checks that every expected fix still happens and that *no fix is ever wrong*, rather than pinning an exact set, so it stays stable under load.
- `auto` remains opt-in (the default mode is `suggest`), and every automatic change is flashed and revertible.

**Exit criterion.** `npm run eval` reports decision instability 0 (it compares three normal runs and one run under CPU load), and `npm run eval:check` passes.

**Options when this is addressed:**
1. **Recommended: deterministic one-edit check.** The worker enumerates every one-edit variant of the word (delete, insert, substitute, adjacent swap, over the `.aff` `TRY` alphabet plus the word's own letters) and checks each with `spell()`. Auto-fix only if exactly one dictionary word is one edit away. Expected cost is roughly 600 `spell()` calls (a few ms) per completed misspelled word, in the worker. Needs a new worker request and a spec wording change ("exactly one dictionary word" instead of "exactly one engine suggestion").
2. **Rebuild Hunspell with the time limits removed** (patching the vendored source). Deterministic, but worst-case suggestion time becomes unbounded, and ranking can still leave out a competing word.

## KI-2: Auto-correct can change part of an email address or URL while it is being typed

**Status:** resolved October 5, 2026 by the `autocorrect-reliability` change. A word completed by `.` `@` `:` or `/` is held until the agent types whitespace or a line break, and it's decided only if it's still a checkable word then. A word that became part of an address is dropped. The benchmark measures 0 exclusion leaks (it was 17), and composer tests type "info@gosi.gov.sa" and "https://www.gosi.gov.sa/en" character by character with no change at any step. A remaining gap, not seen in the data: `-` and `_` aren't held, so a misspelled word before a hyphen inside an address ("seperate-x@…") can still be changed. `test/eval/pipeline.test.ts` records such a case as a transient replacement.

**Original status:** open, found October 3, 2026 by the `spelling-eval` parity test.

**What happens.** Exclusions are recognized on the text typed so far. While an agent types `info@gosi.gov.sa`, the "." after "gosi" is a typed boundary that completes the word "gosi" before the text matches the email pattern. In `auto` mode, "gosi" is replaced with "gosh" (the only one-edit suggestion). Every URL typed by hand is affected too: the ":" after "https" completes "https", which becomes "HTTP". Underlines aren't affected, because they're computed on the finished text.

**Evidence.** `test/eval/pipeline.test.ts` ("judges auto-replacement in typing order") and `test/eval/parity.test.ts`. `npm run eval` reports such cases as `exclusion-leak`.

**Options:** don't auto-replace a word followed by "." or "@" with no space when the word touches "@", "://" or a following letter, or hold the decision until the next whitespace. Judge any fix with `npm run eval:check`.

## KI-3: A stray capital inside a word is auto-replaced with a different word

**Status:** resolved October 5, 2026 by the `autocorrect-reliability` change. If lowercasing everything after the first letter gives a correct word, auto-correct applies that case fix and never picks another word. In the error-type matrix, the English `case` row went from 12 wrong fixes to 0, with auto-replace coverage from 0% to 64% and correction@1 from 67% to 99%.

**Original status:** open, found October 3, 2026 by the `spelling-eval` error-type matrix (English `case` row: 12 wrong fixes out of 97 variants).

**What happens.** `decide()` in `src/autocorrect/confidence.ts` lowercases the word before measuring edit distance. For "thiS", the intended "this" is then at distance 0, which doesn't count as "one edit away", so the only one-edit suggestion wins. In `auto` mode: "thiS" → "thin", "accounT" → "accounts", "previoUs" → "precious", "withiN" → "withing". A Shift key held a moment too long produces exactly this kind of typo.

**Options:** treat a case-only difference as the best candidate (fix the case, or leave the word alone), and never pick another word when a case-only fix exists. Judge any fix with `npm run eval:check` and the `case` row of the matrix.

## KI-4: The evaluation datasets still need a human review

**Status:** open, deferred when the `spelling-eval` change was archived (October 3, 2026). Do this before trusting the benchmark's numbers for a product decision.

**What is pending.** Claude drafted the clean and typo messages in `eval/datasets/src/` (`clean-en`, `clean-ar`, `clean-mixed`, `typos-en`, `typos-ar`). The engine checks found no typos in the clean text, and every curated typo is a non-word. Still, no person has confirmed that the English and especially the Arabic read as correct, natural agent language, or that the excluded spans are marked completely. The manifest entries say "human review: pending".

**To close it:**
1. A fluent reviewer reads each source file and fixes any wrong or unnatural sentence and any missing ⟦…⟧ mark.
2. Run `npm run eval:build`, then regenerate `injected-*` and `words-*` with the commands recorded in `eval/datasets/MANIFEST.json`.
3. Change "human review: pending" to name the reviewer and the date, then run `npm run eval:manifest -- --write`.
4. Run `npm run eval:baseline` and commit the reviewed baseline.
