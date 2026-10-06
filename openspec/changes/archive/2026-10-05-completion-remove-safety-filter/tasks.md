# Tasks

## 1. Remove the filter (Tier 2)

- [x] 1.1 Delete `server/safety.ts` and `test/server/safety.test.ts`. In `server/complete.ts`, remove the safety step, `libraryVocabulary` and `allowSourcedFigures`, and type `onWithheld` for `format`. Narrow `CompleteReply.withheld` to `'format'` in `server/types.ts` (design D1). Verify with `test/server/complete.test.ts`:
  - the offline "3 working days" replay (the old T4.14) now returns "… within 3 working days …" with no `withheld`;
  - a fixed model's " Noura, we will write to noura@example.com." is returned;
  - an Arabic timeline (" وسيتم معالجته خلال ثلاثة أيام عمل.") is returned;
  - a mixed Arabic/English customer message with an email is sent unredacted in the prompt;
  - `format` withholds and the mid-word and tester-guide replays still pass;
  - `onWithheld` is only ever called with `format`.
- [x] 1.2 Replace the prompt's ban lines with the grounding line, and drop `systemInstruction`'s parameter (design D2). Verify with `test/server/prompt.test.ts`: the instructions no longer contain "Do not include any number" or "only exactly as written", do contain the grounding line and the policy line, and still describe `word`/`rest`.
- [x] 1.3 Remove the setting: `sourcedFigures()` and its test, `COMPLETION_SOURCED_FIGURES` in `server/main.ts`, and `sourcedFigures` in `/health` (design D3). Verify with `test/server/model-select.test.ts` (the `sourcedFigures` tests removed, the rest passing) and the typecheck.

## 2. Telemetry, config and docs

- [x] 2.1 Keep the old reasons in `server/telemetry.ts`, and update the comment and the summary label (design D4). Verify with `test/server/telemetry.test.ts`: older `figure`, `conversation` and `spelling` lines still sanitize and count, and the label test is updated.
- [x] 2.2 Remove `COMPLETION_SOURCED_FIGURES` from `.env.example`, `README.md` and `CLAUDE.md` (design D3). Verify with `grep -rn SOURCED_FIGURES` outside `openspec/changes/archive`: nothing is left.
- [x] 2.3 Update `docs/TESTING.md` (T4.14–T4.16, T8.1, the known limitations), `src/completion/README.md` and the gap analysis's Req 3.7 row (design D5). Verify that they match the delta specs.
- [x] 2.4 Replace SV question 3 in `docs/requirements/sv-questions-2026-10-05.md` with the PII question (design D5). Verify that it reads consistently with the gap analysis.

## 3. Integration

- [x] 3.1 Restart the demo with Gemini and replay the tester's chat ("When it fails, we blame the RL…" at its pause points) and the 20-case `scripts/measure-completion.ts`: no `withheld` except `format`, and the "proce"/"your request" cases now show "within 3 working days". Back up and restore `telemetry/events.jsonl` around the run. Manual check on the demo page: T4.14 and T4.16 as rewritten.
- [x] 3.2 Run `npm run typecheck`, `npm test` and `npm run build`, and `openspec validate completion-remove-safety-filter --strict`. Verify that all pass.

## Notes

Integration run, 2026-10-05, Gemini `gemini-3.5-flash-lite`, with no `COMPLETION_SOURCED_FIGURES` set:
- **Tester's chat** ("When it fails, we blame the RL…", 7 pause points × 3):
  - 13 shown, 8 withheld as `format`, 0 for content. Before, 9 of 33 were withheld as `conversation`.
  - The `format` withholds come from Gemini putting the next word, or an empty `word`, after a finished word. That's the separate typed-word-hint follow-up.
- **20-case measurement:** 20/20 correct seams, nothing withheld, p50 729 ms and p95 924 ms. "proce" and "your request" now show "…within 3 working days…".
- **T4.16** (a name from the conversation): with the prefix "Thank you for contacting us" (no comma), Gemini sometimes answers `word: ""` after "us", which is a `format` withhold. The guide now uses "Thank you for contacting us," with the comma. Through the server, the model followed the canned wording, so nothing was withheld.
- **Spec fix:** when identifiers came through, two finalize rules mangled them, and both were fixed in this change, with the spec updated:
  - the one-sentence cut stopped at the "." inside "noura@example.com";
  - the script check rejected an email after an Arabic prefix.
- **Observed:** with only the prompt's grounding line, Gemini once wrote "within 5 working days" (the sources say 3) in a direct call without canned responses. Invented details are now possible; this is the risk noted in the design.
