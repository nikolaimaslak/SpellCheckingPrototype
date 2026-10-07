# Proposal

## Why

Trying completion on the demo page means building the conversation first:
- clicking through the built-in customer scenario, one customer message at a time;
- or typing customer messages by hand.

Agent messages can't be added except by sending them. To try the model on a conversation you already have (such as the one just used for the local eval, `chat1.txt`), you have to retype it.

Canned responses also steer the model toward the demo's own wording. With a real conversation loaded, that hides how the model behaves on that conversation, and we're questioning canned responses as they are now.

So the demo page should load a whole conversation, both customers and agents, from pasted text or a file, in the same format as the local eval. It should stop before an agent message of your choice, so you can type that message yourself and watch the suggestions. Loading a conversation also turns canned responses off.

Serves **PER #60145** (auto-complete), Phase 3. This is demo and tester tooling.

## What Changes

- **A "Load conversation" control in the chat panel,** next to the customer scenario controls. You paste text, or pick a local text file (read in the browser, never uploaded), in the eval's chat format:
  - `Customer:` / `Agent:` or `العميل:` / `الموظف:` turns;
  - unlabeled lines continue the previous turn;
  - `---` between conversations;
  - `#` lines are comments.
- **Choosing what to load:**
  - when the text holds several conversations, a list chooses one, labeled by its first message;
  - "Load up to" chooses where to stop: before agent message 1…N, or the whole conversation.
- **Loading** replaces the chat transcript with the chosen turns, customer and agent each labeled and shown with automatic text direction. It then turns **canned responses off** in the settings and applies them. The change is visible in the settings panel and can be switched back on. The knowledge base, defaults and presets don't change.
- **Clear errors:** for text with no labeled turns, and warnings for skipped lines, shown on the page, never as a browser alert.
- **A TypeScript parser for the chat format,** with a shared fixture (`test/fixtures/chat-format.json`) checked against both it and the Python eval parser, so the two stay equal.
- **Docs:** a tester-guide scenario, plus a pointer from `docs/COMPLETION-EVAL.md`.

## Non-goals

- **No server change** and no network request: the file is read in the browser.
- **No change to the defaults or presets for canned responses,** and no change to the offline test model. The offline model still builds its suggestions from canned text, so with canned responses off it shows few completions.
- **No comparison** between the agent's original next message and what you type. The loaded transcript simply stops before it.
- **No loading into the email composer.**
- **No change to the built-in scenarios** or the "Customer says" input. They keep working after a load and add to the loaded transcript.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `demo-harness`: adds the "Load a conversation" requirement (input, choice, stop point, canned responses off, errors, parser parity).
- `tester-kit`: the tester guide's feature list gains conversation loading.

## Impact

- **Code:**
  - `src/demo/conversation.ts` (new: parser and loader UI);
  - `index.html` (the control);
  - `src/demo/main.ts` (wiring);
  - `src/demo/style.css` (layout).
- **Tests:**
  - `test/demo/conversation.test.ts` (jsdom);
  - `test/fixtures/chat-format.json`, shared with the new `server/tests/eval/test_chat_format_parity.py`.
- **Docs:** `docs/TESTING.md`, `docs/COMPLETION-EVAL.md`.
- **Dependencies:** none. Tier 1 stays network-free.
