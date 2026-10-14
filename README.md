# Composer assistance prototype

A demo page for the algorithms behind writing help in Bright Pattern Agent Desktop's message composer, in **Arabic and English**:
- **Spell checking and auto-correct** (PER #60254), by an LLM.
- **Smart Compose-style inline completion**, grounded in the conversation, canned responses and a knowledge base (PER #60145).
- An on-demand **grammar polish** button (PER #60254).

## Quick start (testers)

You need **Node.js 23.6 or newer** (`node --version`) and a current **Chrome or Edge** (Safari 17.2+ and Firefox 140+ also work).

```sh
npm install
npm run dev
```

Then open **http://localhost:5173/** and follow the **[tester guide](docs/TESTING.md)**: scenarios, what to type, and what you should see. Stop it with **Ctrl+C**.

Everything needs an **OpenAI API key**: type it in the settings panel (it is saved in this browser). The page then calls OpenAI (`gpt-4.1-mini`) directly, and the line under the title says so. Text you type in the message field, the conversation, canned responses and KB are sent to OpenAI, so **use made-up text only**. Without a key the field is a plain text box.

**Found a problem?** Fill in [`docs/TEST-REPORT-TEMPLATE.md`](docs/TEST-REPORT-TEMPLATE.md) (include `git rev-parse --short HEAD`) and send it to whoever shared the prototype with you.

### Troubleshooting

| Problem | Fix |
|---|---|
| "Node 23.6.0 or newer is required" | Install a current Node from https://nodejs.org. |
| "Port 5173 is already in use" | Another program uses it. Find it with `lsof -i :5173`, stop it, and run `npm run dev` again. |
| Page doesn't load | Use exactly `http://localhost:5173/` (`http://127.0.0.1:5173/` also works) while `npm run dev` is running. |
| No underlines, no grey suggestion, or Polish says it is unavailable | No OpenAI API key, or a wrong one. The event log shows `"reply":null`. |
| Underlines don't show although the events list mistakes | Use a supported browser (one with the CSS Custom Highlight API, listed above). |
| Settings got confusing | Press **Reset** in the settings panel. |

## What the demo contains

- **One message field:** Enter adds the message to the Conversation as the agent, Shift+Enter breaks the line. Spelling underlines, the suggestions popover (click a word or Ctrl+.), auto-correct, the grey completion (Tab accepts) and the **Polish** button all work on it. Ctrl/Cmd+Z undoes any automatic change.
- **Settings:** the OpenAI API key, spell check, auto-correct, custom dictionary, completion on or off, and the sources as plain text: **Conversation** (`Customer:` / `Agent:` lines, with a scenario button that adds the next customer message), **Canned responses** and **Knowledge base**. Saved in the browser; **Reset** goes back to the defaults.
- **Events:** every event (the request to the model and its answer, underlined word, auto-correction, completion, polish) as one JSON line, at the bottom of the page.

All customer messages, canned responses and knowledge-base articles are **synthetic demo data**.

## For developers

| Script | Purpose |
|---|---|
| `npm run dev` | The demo page (Vite, :5173) |
| `npm test` | Unit tests: Vitest |
| `npm run typecheck` | Type checking |
| `npm run build` | Production build of the demo page to `dist/` |

**Architecture:** see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. In short:
- **The page:** React + Tailwind (`src/app/`) draws the state of `createAssistant` (`src/assistant/`), which handles the message field's events. Everything but drawing is plain TypeScript in `src/assistant/` and `src/tokenizer/`.
- **Spelling and completion:** while the agent types, `src/assistant/check.ts` sends the draft to the model at most once a second (and once after the last keystroke). The answer lists the misspelled words with fixes and whether the model is sure, plus the text that continues the sentence. Sure mistakes are auto-corrected (one Ctrl/Cmd+Z each), the others are underlined with their fixes in the popover, and the continuation is shown as grey text.
- **Polish:** the button sends the whole draft and shows the fixed version as a preview.
- **Drawing:** underlines use the CSS Custom Highlight API and the grey text is an overlay: nothing is written into the field's DOM. All model calls are in `src/assistant/server.ts`.

`CLAUDE.md` describes the layout and constraints. Requirements and the original architecture draft are in `docs/`. Work is planned and tracked with OpenSpec under `openspec/`.

## Licensing and terms

- **OpenAI API:** OpenAI terms of use. It's not shipped.
