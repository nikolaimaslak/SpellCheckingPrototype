# Tasks

## 1. Parser and parity

- [x] 1.1 Write `parseChat` in `src/demo/conversation.ts`, mirroring `server/assist_eval/sources.py` (design 1). Add `test/fixtures/chat-format.json` with about 8 entries: English, Arabic labels, mixed text with a continued line, two conversations, comments and label variants, text before the first label, CRLF, and no labels. Verify:
  - `test/demo/conversation.test.ts` runs every entry through `parseChat`;
  - `server/tests/eval/test_chat_format_parity.py` runs every entry through `parse_chat`;
  - both pass;
  - editing one expected text in the fixture fails both.

## 2. Loader

- [x] 2.1 Write `mountConversationLoader` with the `<details>` control in `index.html`, styles in `src/demo/style.css`, and wiring in `src/demo/main.ts` (design 2 and 3). The control has the textarea, the file input with the 1 MB limit, the conversation list, the "Load up to" list (defaulting to before the last agent message), the Load button and the live status output. `onLoaded` unticks canned responses and submits the settings form. Verify with jsdom tests in `test/demo/conversation.test.ts`, covering every "Load a conversation" scenario:
  - English up to agent message 2 (the transcript has 3 labeled turns, and `readTranscript` returns them);
  - Arabic labels with `dir="auto"` items;
  - a mixed continued line;
  - choosing the second of two conversations;
  - the whole conversation;
  - canned responses turned off and the knowledge base unchanged (the settings form's checkboxes after a load, through `onLoaded`);
  - a file read locally (`File` with `text()`, and no `fetch` called);
  - no labeled turns (the message is shown and the transcript is unchanged).

## 3. Docs and checks

- [x] 3.1 Add a tester-guide scenario to `docs/TESTING.md`: load `eval/completion/examples/chat-example.txt`, choose the Arabic conversation and "before agent message 2", check that canned responses are off in Settings, then type the agent's message and watch the suggestions; do the same in English. Mention that the offline test model shows few completions with canned responses off. Add a line to `docs/COMPLETION-EVAL.md` noting that eval inputs load on the demo page too. Verify against the tester-kit "Conversation loading scenario" scenario.
- [x] 3.2 Final gate: `npm test`, `npm run typecheck`, `npm run build` and `openspec validate demo-load-conversation --strict` all pass. Then a manual check on the demo page: load `../chat1.txt` from a file and `chat-example.txt` by pasting, in English and Arabic, and see suggestions with Gemini. The user does this, or confirms it.
