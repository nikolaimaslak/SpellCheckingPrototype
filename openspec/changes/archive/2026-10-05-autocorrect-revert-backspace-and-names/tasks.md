# Tasks

## 0. Starting point

- [x] 0.1 Run `npm run eval:check` on the current `main` and keep the report as `before`. Verify that it passes against the committed baseline.

## 1. Context helpers and decision guards

- [x] 1.1 Create `src/autocorrect/context.ts` with `startsSentence(text, start)`, `conversationWords(turns)` and `inConversation(word, lang, words)` (design D1). Verify with `test/autocorrect/context.test.ts`:
  - start of text, after a line break, after ". ", "! ", "؟ " → true;
  - mid-sentence, after "Ms. ", "Dr. ", "e.g. ", after "Al-" → false;
  - after an opening quote at the start → true;
  - conversation words are normalized ("Noura" matches "noura"; "نُوره" matches "نوره"), and only customer turns count.
- [x] 1.2 Add the `startsSentence` (default true) and `conversation` guards to `decide()` (design D1). Verify with `test/autocorrect/confidence.test.ts`:
  - "Fatimah" with `startsSentence: false` → null, even with a single neighbor;
  - "Teh" mid-sentence → null, at sentence start → "The";
  - "Seperate" at sentence start → "Separate";
  - a conversation word → null for EN and AR;
  - with no context passed, all existing cases keep their results.

## 2. Composer

- [x] 2.1 In `src/composer/attach.ts`, add the `conversation` option, and compute `startsSentence` and the conversation word set in `autoCorrect` (design D2). Verify with `test/composer/autocorrect.test.ts`:
  - "Dear Ms. Fatimah, " and "Dear Mr. Al-Harbi, " leave the names unchanged (with the fake service flagging them and giving one neighbor);
  - "Thanks. Seperate forms " fixes "Seperate";
  - with a conversation containing "Hello, this is Noura", "Noura, thank you " leaves "Noura";
  - with "معك نوره من الرياض", "شكراً نوره، " leaves "نوره";
  - in the mixed "تم تحديث بيانات Almarai والنضام ", "Almarai" is left (from the conversation);
  - without a conversation, "Noura, " is decided by the other rules.
- [x] 2.2 Implement Backspace revert (design D3). Verify with `test/composer/autocorrect.test.ts`:
  - "please seperate " then Backspace → "please seperate ", caret after the space, a `revert` event, and "seperate " typed again is not corrected;
  - the Arabic "رقم المستخذم " then Backspace → "رقم المستخذم ";
  - a correction landing after "separate t" was typed, then Backspace → not intercepted, correction stays;
  - typing a character, deleting it, then Backspace → not intercepted;
  - Ctrl+Backspace → not intercepted;
  - the intercepted Backspace never reaches a host keydown listener;
  - one Undo after a Backspace revert brings back the correction (simulated by the fake undo, as in the existing Undo test).
- [x] 2.3 Wire `conversation: () => readTranscript(transcript)` into both composers in `src/demo/main.ts`. Verify with a test in `test/demo/` (or by typecheck plus a composer test using the transcript shape) that the option receives the customer turns.
- [x] 2.4 Update `src/autocorrect/README.md` (the guards) and `src/composer/README.md` (the `conversation` option, Backspace revert). Verify that they match the code and the delta spec.

## 3. Eval

- [x] 3.1 Pass `startsSentence` in `eval/pipeline.ts` (design D4). Verify with `test/eval/pipeline.test.ts`: "Ms. Fatimah, I have sent you the form." leaves "Fatimah" unreplaced; "Thanks. Seperate forms are needed." still fixes "Seperate"; and `test/eval/parity.test.ts` still agrees, with the Fatimah message added.
- [x] 3.2 Run `npm run eval:check` against the old baseline. Verify that the Fatimah and Harbi corruptions are gone, there are no new corruption or wrong-fix identities, precision and corruption don't get worse, and decision instability stays 0. Then run `npm run eval:baseline` and add a short "Baseline after `autocorrect-revert-backspace-and-names`" section to `docs/EVALUATION.md`.

## 4. Docs

- [x] 4.1 Update `docs/TESTING.md`:
  - names in mid-sentence ("Dear Ms. Fatimah,␣" unchanged);
  - a name from the conversation (send a customer message containing "Noura", then type "Noura, thank you␣");
  - Backspace right after a correction reverts (T3);
  - Backspace after typing more deletes normally.

  Verify that the numbering and the limitations are consistent (British spellings remain a limitation).
- [x] 4.2 Update `docs/requirements/gap-analysis-60145-60254.md`: Req 4.2.1 (Backspace done; session-wide scope deliberate) and Req 4.2.2 (names: mid-sentence capitals and conversation words), and add the change to the "Done" list. Verify that the rows and the list are consistent.

## 5. Integration

- [x] 5.1 Manual check on the demo page: covered by 2.1–2.3 (composer tests for names in mid-sentence, conversation words in English, Arabic and mixed text, every Backspace case; the demo test for transcript wiring), using the task's fallback as for the previous changes. The visual check is left to testers through `docs/TESTING.md` T2.20, T2.21 and T3.4–T3.6.
- [x] 5.2 Run `npm run typecheck`, `npm test` and `npm run build`. Verify that all pass.
- [x] 5.3 Run `openspec validate autocorrect-revert-backspace-and-names --strict`. Verify that it passes.
