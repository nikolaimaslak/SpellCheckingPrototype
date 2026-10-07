# Design

## Context

For motivation, see proposal.md.

The demo's chat transcript is an `<ol id="chat-transcript">` of `<li data-role>` items:
- `addMessage(transcript, role, text)` in `src/demo/chat.ts` appends one, with `dir="auto"`;
- `readTranscript()` gives completion its conversation.

Customer scenarios (`src/demo/scenarios.ts`) only add customer turns.

The settings panel (`src/demo/settings.ts`) has a `sourceCanned` checkbox, and submitting its form applies and saves the settings.

The chat format is defined by the local eval's parser, `server/assist_eval/sources.py`.

Everything here is **Tier 1 demo code**: no server, no network.
- **Editable DOM and undo:** no interaction. The transcript isn't editable, and loading doesn't touch the composer.
- **RTL:** each loaded turn gets `dir="auto"` through `addMessage`, so Arabic turns read right to left.

## Goals / Non-Goals

**Goals:** paste or pick a file, choose a conversation and a stop point, load it, with canned responses off. The parser behaves like the eval's.

**Non-goals:** see proposal.md.

## Decisions

### 1. Parser (`src/demo/conversation.ts`)

`parseChat(text): { conversations: Turn[][]; warnings: string[] }` mirrors `parse_chat` line for line:
- the same label pattern: `^\s*(customer|agent|العميل|الموظف)\s*:\s*(.*)$`, case-insensitive;
- the same handling of comments and `---`;
- unlabeled lines trimmed and joined with `\n`;
- the same warning text (`line N: text before the first role label, skipped`);
- empty turns and empty conversations dropped.

**Parity:** `test/fixtures/chat-format.json` holds about 8 entries of `{ name, text, conversations: [[{role, text}]], warnings }`:
- English;
- Arabic labels;
- mixed text with a continued line;
- `---` with two conversations;
- comments, upper-case labels and spaces around the colon;
- text before the first label;
- Windows line endings;
- no labels at all.

`test/demo/conversation.test.ts` and `server/tests/eval/test_chat_format_parity.py` both run every entry.

**Alternative: send the text to the server's Python parser.** Rejected: it adds a network call and a server endpoint to the demo for a 40-line parser.

### 2. Loader UI

The control is a `<details class="load-conversation">` disclosure in `.customer-controls`, labeled "Load conversation…". Inside:
- **Inputs:** a `<textarea dir="auto">` for pasted text, and an `<input type="file" accept=".txt,text/plain">`. A picked file is read with `File.text()` when it's 1 MB or less, and its text goes into the textarea, so pasted text and a file behave the same.
- **Re-parsing:** every edit re-parses (debounced 150 ms) and refreshes the rest of the control.
- **Conversation list** (`<select>`): shown only when there are 2 or more conversations. Entries read "1 · Hi, I submitted a request…", with the first message cut at 40 characters.
- **"Load up to" list** (`<select>`): "Before agent message 1: “Thank you for waiting…”" through "…N", then "Whole conversation". The default is before the last agent message. A conversation without agent messages offers only "Whole conversation".
- **A "Load" button,** disabled while there's nothing to load.
- **An `<output aria-live="polite">`** for the turn and conversation counts, warnings ("2 lines skipped: line 1, line 3") and the "no turns found" error. No `alert()` is ever used.

**Loading:**
1. empties the transcript;
2. adds each turn up to the stop point with `addMessage` (labels and direction as today);
3. calls the `onLoaded` callback;
4. closes the disclosure and focuses the chat composer.

`mountConversationLoader(root, transcript, { onLoaded })` returns nothing. `main.ts` wires it up.

### 3. Canned responses off

`main.ts` passes an `onLoaded` that unticks the settings form's `sourceCanned` checkbox and calls `form.requestSubmit()` when it was ticked. That's the same path as a user unticking it and pressing Apply, so the setting is applied, saved and visible, with no second code path. The knowledge base and the other settings stay as they are.

The loader shows "Canned responses turned off for this conversation (Settings → Completion context)." when it changed the setting.

**Alternative: a per-request override that bypasses the settings.** Rejected: it would be invisible, and it would diverge from what the settings panel shows.

## Risks / Trade-offs

- **Two parsers.** → The shared fixture fails either suite when one drifts.
- **The offline model with canned responses off** shows few completions after a load. → The loader's note says canned responses were turned off, and the tester guide says to use a live model or tick canned responses back on.
- **Large pasted text.** → The file limit is 1 MB, and parsing is linear. Pasted text isn't capped, but it's only parsed while typing pauses.

## Migration Plan

Additive. Rollback: remove the control and the wiring.
