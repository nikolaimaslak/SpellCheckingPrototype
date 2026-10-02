# Known issues

## KI-1: Auto-correct confidence depends on Hunspell's time-limited suggestions

**Status:** open, deferred (decided October 2, 2026, during the `auto-correct` change). Address before GOSI enables `auto` mode in production.

**What happens.** The auto-correct confidence rule (`src/autocorrect/confidence.ts`) fixes a word only when *exactly one* engine suggestion is a single edit away. It reads those suggestions from Hunspell's `suggest()`, which stops generating candidates after fixed time budgets: `TIMELIMIT_SUGGESTION_MS` (100 ms per stage) and `TIMELIMIT_GLOBAL_MS` (250 ms in total), defined in Hunspell's `src/hunspell/atypes.hxx`. On a busy or slow machine the list comes back shorter. If a competing one-edit candidate is cut, an ambiguous word looks unambiguous, so **auto-correct gets more aggressive under CPU load**. Even without load, `suggest()` ranks and prunes; it doesn't guarantee to list every dictionary word one edit away.

**Evidence.**
- The Arabic typo corpus (`test/autocorrect/corpus.test.ts`) gave 5 auto-fixes when run alone and 6 inside the full parallel test suite. The extra fix happened to be correct.
- Suggestions shown in the popover are affected too: under parallel test load, "GOSSI" sometimes got only `["GOSSIP"]` and lost the custom word "GOSI" (`test/autocorrect/custom-words.test.ts`).

**Current mitigation.**
- Vitest runs test files serially (`fileParallelism: false` in `vite.config.ts`), so real-engine tests aren't starved of CPU.
- The corpus test checks that every expected fix still happens and that *no fix is ever wrong*, rather than pinning an exact set, so it stays stable under load.
- `auto` remains opt-in (the default mode is `suggest`), and every automatic change is flashed and revertible.

**Options when this is addressed:**
1. **Recommended: deterministic one-edit check.** The worker enumerates every one-edit variant of the word (delete, insert, substitute, adjacent swap, over the `.aff` `TRY` alphabet plus the word's own letters) and checks each with `spell()`. Auto-fix only if exactly one dictionary word is one edit away. Expected cost is roughly 600 `spell()` calls (a few ms) per completed misspelled word, in the worker. Needs a new worker request and a spec wording change ("exactly one dictionary word" instead of "exactly one engine suggestion").
2. **Rebuild Hunspell with the time limits removed** (patching the vendored source). Deterministic, but worst-case suggestion time becomes unbounded, and ranking can still leave out a competing word.
