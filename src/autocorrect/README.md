# autocorrect

**Auto-correct confidence layer** (architecture §3): Tier 1, browser, no network.

Decides, for a misspelled word the agent just completed, whether to auto-replace it or leave it as an underlined suggestion. Precision over recall: when in doubt, it's a suggestion.

## The rule (`confidence.ts`)

`decide(word, lang, { neighbors, caseFix }, ctx)` returns `{ fix, source }` or `null`:

1. **Guards.** It returns `null` for a word on the session ignore list or in the custom dictionary, or a word written all in capitals.
2. **Known misspelling** (`source: 'list'`). If the word is on the misspellings list (`misspellings.ts`, `knownFix`), it returns the list's fix, whatever the word's length or neighbors ("teh" → "the", "اذا" → "إذا").
3. If the admin's auto-replace confidence (`ctx.confidence`) is `list`, it stops here and returns `null`.
4. **Minimum length.** It returns `null` for a word shorter than 4 letters (English) or 3 (Arabic, counted without diacritics).
5. **Case-only fix** (`source: 'case'`). If `caseFix` is set (the word with its first letter as typed and the rest in lower case, accepted by the engine), it returns that word and never another one. So "oNly" → "only", not "oily".
6. **Single neighbor** (`source: 'neighbor'`). If exactly one dictionary word is one edit away (`neighbors`) and it starts with the same letter (the Arabic alef forms ا أ إ آ count as one), it returns that word.
7. Otherwise `null`.

Every fix gets a leading capital if the typed word had one (`withLeadingCapital`). `needsEvidence(word, lang, confidence)` tells the caller when steps 5–6 can't apply, so it can skip the engine requests.

The decision is **deterministic**. `neighbors` comes from the worker's `neighbors` request, which checks *every* one-edit variant with `spell()` (`neighbors.ts`: deletions, adjacent swaps, substitutions and insertions over the dictionary's `TRY` letters plus the word's own letters). There's no ranking or time limit, unlike Hunspell's `suggest()`, so CPU load can't change a decision. The popover's suggestions come from `suggest()`, with a known misspelling's fix first.

**Arabic is conservative.** Arabic morphology (clitics, affixes) gives most misspellings several dictionary words one edit away ("النضام" has 24), so the single-neighbor rule rarely applies. The frequent slips (missing hamza, ة/ه) are covered by the list instead.

## The misspellings lists (`misspellings.ts`, `lists/`, `list-checks.ts`)

- `lists/en.ts`: `EN_PROJECT`, written for this project.
- `lists/ar.ts`: `AR_PROJECT`, written for this project, and `AR_AYASPELL`, generated from AyaSpell's whole-word `REP` rules in `dicts/ar/ar.aff` (MPL 1.1) by `npm run lists:ayaspell`. `AYASPELL_NOT` holds the acknowledgements for those rules.

Each list is `typo<TAB>fix` lines, with an optional Arabic `not:` column. Every entry must pass `checkEntry` against the real engine (`test/autocorrect/misspellings.test.ts`):
- the typo is rejected and the fix is accepted;
- both are single words in the same script;
- English typos have at least 3 letters;
- the typo is not a custom word;
- Arabic only: every other ا/أ/إ/آ spelling the dictionary accepts is acknowledged in `not:` as not a plausible fix. Words like "ان" (أن or إن) are never listed.

The project lists await human review (`docs/known-issues.md`, KI-5).

## When it's asked (`trigger.ts`)

- `boundaryKind(e)` classifies the input just typed:
  - `release`: whitespace, a line break or a new paragraph;
  - `hold`: `.` `@` `:` `/`, which also occur inside emails and URLs;
  - `decide`: any other punctuation;
  - `none`: anything else, such as paste, multi-character insertions or IME.
- `completedWord` finds the word immediately before the boundary.
- `releasable` picks the held words that are still checkable words in the same whitespace-free run when whitespace arrives. Words that end up inside an address ("info@gosi.gov.sa") are dropped.

The composer (`src/composer/attach.ts`) and the eval pipeline (`eval/pipeline.ts`) both use these functions.
