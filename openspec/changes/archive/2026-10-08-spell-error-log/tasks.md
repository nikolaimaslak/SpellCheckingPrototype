# Tasks

## 1. Layer events (Tier 1)

- [x] 1.1 In `src/composer/attach.ts`, emit `flag` once per word per message (design 1), and `unresolved` for words still underlined when the composer empties (design 1b). Add `rank` and `offered` to `accept` (design 2). Verify with jsdom tests in `test/composer/`:
  - English "chek" is flagged once across several rechecks;
  - Arabic "النضام" is flagged in suggest mode;
  - a message with "chek" and "الطلبب" gives one flag each;
  - "chek" is flagged again after the composer is emptied;
  - picking the 2nd of 4 suggestions gives `rank: 2, offered: 4`;
  - an auto-replaced word gives `autocorrect` and no `flag`;
  - "chek" left underlined and the composer emptied gives `unresolved` (en, chek), once;
  - Arabic "النضام" left underlined gives `unresolved` (ar);
  - a word fixed from the popover, ignored, or retyped correctly before the send gives no `unresolved`.

## 2. Server (Tier 2)

- [x] 2.1 In `server/assist/telemetry.py`, allow `flag`, `unresolved` and `rank`/`offered`, and keep `spelling_by_lang` figures unchanged (design 3). Verify with `server/tests/test_telemetry.py`:
  - a `flag` with extra text fields stores only the allowed fields;
  - an `unresolved` stores only the allowed fields;
  - `accept` keeps `rank` and `offered`;
  - the existing summary tests still pass.
- [x] 2.2 Write `server/assist/spelling_report.py` (the pure function and the CLI), add the `/summary` section, and add the `telemetry:spelling` npm script (design 4). Verify with `server/tests/test_spelling_report.py`, covering every "Spelling error report" scenario:
  - the English custom dictionary candidate;
  - the Arabic misspellings candidate with its type;
  - a removal candidate;
  - a word below the threshold;
  - languages kept apart.

  Also verify that the CLI writes both files from a temporary log.

## 3. Docs and checks

- [x] 3.1 Document the `flag` event and the report in `docs/TESTING.md` (telemetry scenario) and CLAUDE.md (commands), including the note that flagged words can be names and the log stays local. Then run the final gate: `npm test`, `npm run typecheck`, `npm run build` and `openspec validate spell-error-log --strict` all pass. Then a manual check: type a few errors in the demo, open `/summary`, and run `npm run telemetry:spelling`.
