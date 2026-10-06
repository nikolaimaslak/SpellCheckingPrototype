# Tasks

## 1. Prompt (Tier 2)

- [x] 1.1 Change the unfinished-word line in `server/prompt.ts` to ask for the whole word (design D1). Verify with `test/server/prompt.test.ts`, which checks for the new line in both modes. Add a `test/server/postprocess.test.ts` case: "…you could have be" + "been easily confused." → "en easily confused.".

## 2. Word check (Tier 1)

- [x] 2.1 Create `src/completion/word-check.ts` with `firstWordToCheck` and `strayLetter` (design D2). Verify with `test/completion/word-check.test.ts`:
  - "…have be" + "n easily" → { "ben", joined };
  - "…have be" + " n easily" → { "n", standalone }, and `strayLetter` is true;
  - "your request" + " has been" → "has";
  - "a" and "I" are not stray;
  - "تم استلا" + "م طلبك" → "استلام";
  - punctuation-first → null;
  - a whitespace-ended prefix + "will" → "will" (standalone).
- [x] 2.2 Add the `checkWord` option and the withhold path to `src/completion/controller.ts`, with the `completion-withheld` event type (design D3). Verify with `test/completion/controller.test.ts`:
  - "…have be" + "n easily confused." with a fake `checkWord` rejecting "ben" → no ghost, and a withheld event with reason `spelling`;
  - " n easily confused." → withheld without calling `checkWord` (stray letter);
  - "ssed yet." with "processed" accepted → shown;
  - `checkWord` returning undefined → shown;
  - no `checkWord` → shown;
  - typing during a slow `checkWord` → not shown;
  - events contain no text.
- [x] 2.3 Verify with the real English and Arabic engines: a test runs `firstWordToCheck` plus the spelling handler on "ben" (rejected), "processed" (accepted), "استلام" (accepted) and "استلاظ" (rejected).
- [x] 2.4 Wire `checkWord` into `src/demo/main.ts` (design D4). Verify by typecheck, and with a small test of the wrapper's logic (`isReady` false → undefined; misspelled → false; correct → true), extracting it into a function in `src/completion/word-check.ts` (`spellServiceCheck(service)`) so it's testable.

## 3. Telemetry

- [x] 3.1 Add `spelling` to the withheld reasons in `server/telemetry.ts`. Verify with `test/server/telemetry.test.ts`: `sanitize` keeps reason `spelling` on `completion-withheld`, and the summary counts it (the spec scenario: 2 `spelling` and 1 `figure`).

## 4. Docs

- [x] 4.1 Update `src/completion/README.md` (word check, `checkWord` option, withheld event) and `docs/TESTING.md`:
  - T4.17 notes that a broken mid-word suggestion is never shown;
  - the T8.1 reasons list gains `spelling`.

  Verify that they match the specs.

## 5. Integration

- [x] 5.1 Replayed through Gemini after the restart (`gemini-3.5-flash-lite`, `allow`, made-up text, October 5, 2026): three requests for "If it weren't for the arcane name you could have be" returned `'en a lawyer.'` (whole word echoed and stripped: correct), `' n eligible.'` and `' n easily registered.'` (bare fragment: the client's stray-letter rule withholds both). The prompt change helps in about 1 of 3 cases; the first-word check catches the rest, covered by 2.2–2.3.
- [x] 5.2 Run `npm run typecheck`, `npm test` and `npm run build`. Verify that all pass.
- [x] 5.3 Run `openspec validate completion-midword-echo --strict`. Verify that it passes.
