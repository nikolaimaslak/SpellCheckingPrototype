# Design

## Context

Auto-correct today (see proposal.md, Why):
1. `attach.ts` captures the word a typed boundary completes (`completedWord` in `src/autocorrect/trigger.ts`).
2. It checks that the word is misspelled, then asks the worker for `suggest()`.
3. The pure `decide()` in `src/autocorrect/confidence.ts` fixes the word only if exactly one suggestion is one edit away (`osa`), after lowercasing.

`eval/pipeline.ts` mirrors this in Node with its own copy of the boundary regexes.

The read-only experiment behind the proposal's table used the real engine, both dictionaries and the eval datasets. It established:
- Enumerating every one-edit variant and checking each with `spell()` costs 1–12 ms per English word and 2–75 ms per Arabic word, less than `suggest()` on the same words (2–180 ms).
- English keeps its coverage, and the case-only fix removes all three case-type wrong fixes.
- Arabic coverage falls from 16.2% to 6.8%, with 1 wrong fix instead of 11. This was accepted (precision first).
- Excluding Arabic clitic variants (a leading و ف ب ل ك, or the alef of ال) from the count changed nothing.
- MAP-class "confusable first" variants lowered precision to 58–81%.

## Goals / Non-Goals

**Goals:**
- The auto-replace decision is a pure function of the word, the dictionaries, the custom words and the ignore list.
- The composer and the eval use the same trigger and decision code, not copies.
- Auto-correct never edits text that ends up inside an excluded span.

**Non-Goals:**
- Changing `suggest()` or the popover's suggestion order.
- Rebuilding the WASM.
- Any change to underline (flag) decisions.

## Decisions

### D1. Neighbors are computed in the worker, by a pure generator plus `spell()` (Tier 1, worker)

New pure module `src/autocorrect/neighbors.ts` exports `oneEditVariants(word, alphabet)`. It covers deletions, adjacent swaps, substitutions and insertions over the alphabet plus the word's own letters, deduplicated and excluding the word itself, in code points so Arabic letters are single units.

The handler (`src/spell/handler.ts`) gets a `neighbors` request:
1. Normalize the word: `stripMarks` for Arabic, lower case for English.
2. Generate the variants.
3. Keep those `isCorrect` accepts. For an English word with a capital first letter, also accept a variant whose capitalized form is correct.
4. Return the list sorted by code point.

The alphabet comes from the `.aff` `TRY` line, parsed once at `load`:
- only letters and the apostrophe are kept;
- English keeps only the lowercase letters;
- Arabic drops the harakat that `TRY` lists (ً ٍ), since words are compared without marks.

The `.aff` is already in hand at `load`, so this costs nothing.

- *Why the worker:* engine work must stay off the page thread (hard constraint), and 300–600 `spell()` calls per word are cheap inside WASM but would be hundreds of round trips through `postMessage`.
- *Why `TRY` and not the full Unicode script:* it's the dictionary's own declaration of which letters occur. The word's own letters are added so an unusual letter in the typo still gets swapped and deleted consistently.
- *Alternative rejected:* rebuilding Hunspell without time limits (KI-1 option 2). It's deterministic but keeps the ranking-based ambiguity, needs Docker and a WASM pin change, and has unbounded worst-case time.

`SpellService` gets `neighbors(lang, word)`, cached per `lang:word` like `check`. Unlike suggestions, the result is deterministic, so caching it is safe.

### D2. `decide()` takes evidence, not suggestions (Tier 1, page)

New signature: `decide(word, lang, evidence, ctx)`, where `evidence = { neighbors: string[]; caseFix: string | null }`. `caseFix` is the case-folded form (first letter as typed, the rest lower case) when the engine accepts it, otherwise null.

Order of checks:
1. Existing guards: ignore list, custom dictionary, all caps, minimum length.
2. If `caseFix` is set, return it.
3. If `neighbors` has exactly one entry with the same first letter (alef class), return it, capitalized if the word starts with a capital.
4. Otherwise null.

A pure helper `caseFolded(word, lang)` returns the candidate (or null for Arabic, or when nothing would change). The composer and the pipeline check it with the existing `check` request, which is cached. That keeps the worker protocol to one new request.

Capitalization now follows "the word starts with a capital", not today's `isCapitalized` (capital followed only by lowercase). This makes "LLet" → "Let", where today's rule would produce "let". In the experiment this changed 2 wrong fixes into correct ones.

- *Alternative rejected:* having the neighbors reply also carry the case fix. That mixes two questions in one request and complicates the spec of a simple worker primitive.

### D3. Hold-until-whitespace trigger, shared by the composer and the eval (Tier 1, page; eval)

`trigger.ts` gains pure, DOM-free functions that work on flat text, a caret offset and tokens (`{ start, end, text, lang }`):
- `boundaryKind(e)` → `'none' | 'decide' | 'hold' | 'release'`:
  - `release`: whitespace, `insertLineBreak` or `insertParagraph`;
  - `hold`: `.` `@` `:` `/`;
  - `decide`: any other single punctuation character;
  - `none`: anything else, including everything `isTypedBoundary` rejects today.
- `completedWord` is unchanged.
- `releasable(held, text, caret, tokens)` returns the held words to decide now. A held word qualifies if a current token has the same start and text, and lies in the whitespace-free run that ends at the boundary just typed. Others are dropped.

`attach.ts` keeps `held: { range: Range; text: string }[]`, using live ranges so earlier edits shift them correctly. Its handling by boundary kind:
- `hold`: append the completed word.
- `decide`: queue the completed word, as today.
- `release`: queue `releasable(...)` in document order, then the completed word, then clear `held`.
- Clearing the composer (send) also clears `held`.

Each queued word goes through the existing `autoCorrect(token)`, which re-validates the word and keeps the caret.

`eval/pipeline.ts` drops its private `BOUNDARY_CHAR`/`GAP` copies and replays typing with the same functions, one character at a time over the text typed so far. As now, the window starts from the last whitespace before the possible word, because exclusion patterns never span whitespace. The end-of-message rule changes: append a space whenever the message doesn't end in whitespace.

- *Alternative rejected:* looking at the next character before deciding. At the moment "." is typed the next character doesn't exist yet. That's exactly the bug.
- *Alternative rejected:* never auto-replacing a word followed by "." at all. That would lose the most common sentence-final fix.
- `-` is not held. Hyphens inside host names are rare in agent text, and holding them would delay fixes in "Al-Harbi"-style compounds for no measured gain.

### D4. Eval: split instability (eval)

`decisionOf` in `eval/benchmark.ts` becomes the outcome plus the replacement. A second key adds the top correction. A token whose first key is stable but whose second varies counts toward `suggestionInstability`. `criteria.json`'s `instability` criterion keeps its id and threshold (0) and now reads decision instability. The report's Stability section shows both counts and lists examples of each.

For information, without a threshold, the latency table gains a "decision p95" column: the time of the neighbors request. This confirms the cost measured in the experiment.

### D5. Tests become exact

With a deterministic rule, `test/autocorrect/corpus.test.ts` pins the exact set of auto-fixes for EN and AR again, instead of a floor. It also drops the KI-1 comment. Vitest's `fileParallelism: false` stays: it also protects the timing of the popover suggestions (see `custom-words.test.ts`), which this change doesn't make deterministic.

### Undo, editable DOM, RTL

- **Undo:** unchanged. Every replacement, including a held word replaced when the space is typed, goes through `env.replace`, so it is one undo step. A held word is replaced *after* the space was inserted, so Undo first reverts the replacement and then the space, the same order as any boundary today.
- **Editable DOM:** nothing is added to it. The flash still uses the Custom Highlight API.
- **RTL:** no layout change. The hold characters are the same in Arabic text (Arabic messages use the Latin "." and ":" in addresses). Arabic ، ؛ ؟ stay `decide` boundaries.

## Risks / Trade-offs

- **Fewer Arabic auto-fixes** (16% → 7%) could look like a regression to testers. → TESTING.md says so under known limitations. The next change (misspellings list) restores the frequent slips deliberately.
- **Neighbors latency on long Arabic words** (up to ~75 ms measured) could delay the worker's next `check` while typing fast. → Measured in the eval (D4 column). The page never waits on it. If p95 exceeds 100 ms, cap the word length for auto-correct, a follow-up decided by data.
- **The English corruption gate still fails** (names, British spellings). → Out of scope (proposal, Non-goals). The proposal and the baseline commit say so explicitly, so nobody reads this change as "auto-replace is ready".
- **The hold delays a fix until the space.** If the agent sends with Enter right after "seperate.", the typo is sent. → This matches the existing rule that nothing changes on send.
- **The baseline moves.** → Run `eval:check` against the old baseline first. Precision and corruption may not get worse, and the identities of new corruptions or wrong fixes must be reviewed. Only then run `eval:baseline`.

## Migration Plan

No data or settings migration. Order:
1. Worker request and service.
2. `decide()`.
3. Trigger and composer.
4. Pipeline.
5. Eval split.
6. `eval:check` against the old baseline (expected: better precision, 0 leaks, no new corruption identities).
7. `eval:baseline`.
8. Docs.

Rollback is a revert of the change. The old baseline is in git history.
