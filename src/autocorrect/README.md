# autocorrect

**Auto-correct confidence layer** (architecture §3): Tier 1, browser, no network.

Decides, for a misspelled word the agent just completed, whether to auto-replace it or leave it as an underlined suggestion. Precision over recall: when in doubt, it's a suggestion.

## The rule (`confidence.ts`)

`decide(word, lang, { neighbors, caseFix }, ctx)` returns the replacement or `null`:

1. **Guards.** It returns `null` for a word on the session ignore list or in the custom dictionary, a word written all in capitals, or a word shorter than 4 letters (English) or 3 (Arabic, counted without diacritics).
2. **Case-only fix.** If `caseFix` is set (the word with its first letter as typed and the rest in lower case, accepted by the engine), it returns that word and never another one. So "oNly" → "only", not "oily".
3. **Single neighbor.** If exactly one dictionary word is one edit away (`neighbors`) and it starts with the same letter (the Arabic alef forms ا أ إ آ count as one), it returns that word, with a leading capital if the typed word had one.
4. Otherwise `null`.

`caseFolded(word, lang)` builds the case-fix candidate; the caller checks it with the engine.

The decision is **deterministic**. `neighbors` comes from the worker's `neighbors` request, which checks *every* one-edit variant with `spell()` (`neighbors.ts`: deletions, adjacent swaps, substitutions and insertions over the dictionary's `TRY` letters plus the word's own letters). There's no ranking or time limit, unlike Hunspell's `suggest()`, so CPU load can't change a decision. The popover's suggestions still come from `suggest()`.

**Arabic is conservative.** Arabic morphology (clitics, affixes) gives most misspellings several dictionary words one edit away ("النضام" has 24), so they stay suggestions. Measured on the eval datasets: Arabic auto-replace covers about 7% of typos at about 97% precision; English about 46% at 99.6%.

## When it's asked (`trigger.ts`)

- `boundaryKind(e)` classifies the input just typed:
  - `release`: whitespace, a line break or a new paragraph;
  - `hold`: `.` `@` `:` `/`, which also occur inside emails and URLs;
  - `decide`: any other punctuation;
  - `none`: anything else, such as paste, multi-character insertions or IME.
- `completedWord` finds the word immediately before the boundary.
- `releasable` picks the held words that are still checkable words in the same whitespace-free run when whitespace arrives. Words that end up inside an address ("info@gosi.gov.sa") are dropped.

The composer (`src/composer/attach.ts`) and the eval pipeline (`eval/pipeline.ts`) both use these functions.
