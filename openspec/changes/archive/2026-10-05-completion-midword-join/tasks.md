# Tasks

## 1. Post-processing

- [x] 1.1 Implement the join-or-space decision in `server/postprocess.ts` (design D1): record the raw leading whitespace before trimming, run the five steps with an optional `isWord` predicate, require a partial of at least 2 characters for echo detection, and run echo stripping before the sentence cut. Verify with `test/server/postprocess.test.ts`:
  - every existing case still passes unchanged (no vocabulary);
  - "It hasn't been proce" + "ssed yet, but it is under review." → joined, with "processed" known;
  - "processed yet, …" → echo stripped to "ssed yet, …";
  - "Thank you, your request" + "will be processed soon." → space (known partial);
  - "Please upload the form" + " today if possible." → space (step 2);
  - "تم استلا" + "م طلبك وسيتم معالجته" → joined, with "استلام" known after normalization;
  - "Abshe" + "r app now." with an empty vocabulary → joined (step 5);
  - a one-letter partial is not treated as an echo.

## 2. Service and prompt

- [x] 2.1 In `server/complete.ts`, build `isWord` from the library vocabulary plus the prefix and conversation words (normalized), and pass it to `postprocess`. Verify with `test/server/complete.test.ts`:
  - the offline-model replay "It hasn't been proce" with the first scenario message gives "ssed within 3 working days; …" with no leading space under `allowSourcedFigures: true`, and is withheld (`figure`) under the default;
  - a whole-word prefix still gets its leading space;
  - the conversation-word safety check doesn't trip on the mid-word fragment.
- [x] 2.2 Add the unfinished-word line to `systemInstruction` in `server/prompt.ts` (design D2). Verify with `test/server/prompt.test.ts`: both modes contain it.

## 3. Docs

- [x] 3.1 Update `docs/TESTING.md` with a mid-word scenario that works under the default setting. Find a figure-free one with a replay test: for example, after the second customer message, type `Your contribution rec` → "ords are up to date…". Also add a note that "It hasn't been proce" completes to "…ssed within 3 working days" only with `COMPLETION_SOURCED_FIGURES=allow`. Verify the scenario with a replay in `test/server/complete.test.ts`.

## 4. Integration

- [x] 4.1 Check against the running demo server (offline model, `allow`): `curl` `/v1/complete` with "It hasn't been proce" and the first scenario message, and confirm the completion has no leading space. If the demo isn't running, start it on a spare port.
- [x] 4.2 Run `npm run typecheck`, `npm test` and `npm run build`. Verify that all pass.
- [x] 4.3 Run `openspec validate completion-midword-join --strict`. Verify that it passes.
