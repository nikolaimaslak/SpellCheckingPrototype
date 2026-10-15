# Auto-complete and auto-correct

A demo page for the algorithms behind auto-complete and auto-correct in Bright Pattern Agent Desktop, in **Arabic and English**:
- **Spell checking and auto-correct** (PER #60254), by an LLM.
- **Smart Compose-style inline completion**, grounded in the conversation, canned responses and a knowledge base (PER #60145).
- A **Polish** button that fixes every mistake the model finds, even the ones it isn't sure about (PER #60254).

## Quick start

You need **Node.js 23.6 or newer** (`node --version`) and a current **Chrome or Edge** (Safari 17.2+ and Firefox 140+ also work).

```sh
npm install
npm run dev
```

Then open **http://localhost:5173/**. Stop it with **Ctrl+C**.

Everything needs an **OpenAI API key**: type it in the settings panel (it is saved in this browser). The page then calls OpenAI (`gpt-4.1-mini`) directly, and the line under the title says so. Without a key the field is a plain text box.


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
- **Settings:** the OpenAI API key, spell check, auto-correct, custom dictionary, completion on or off, and the sources as plain text: **Conversation** (`Customer:` / `Agent:` lines, with English and Arabic presets), **Canned responses** and **Knowledge base**. Saved in the browser; **Reset** goes back to the defaults.
- **Events:** every event (the request to the model and its answer, underlined word, auto-correction, completion, polish) as one JSON line, at the bottom of the page.

All customer messages, canned responses and knowledge-base articles are **synthetic demo data**.

## For developers

| Script | Purpose |
|---|---|
| `npm run dev` | The demo page (Vite, :5173) |
| `npm run typecheck` | Type checking |
| `npm run build` | Production build of the demo page to `dist/` |

**How it works:**
- **The page:** React + Tailwind (`src/app/`) draws the state of `createAssistant` (`src/assistant/`), which handles the message field's events. Everything but drawing is plain TypeScript in `src/assistant/`.
- **Spelling and completion:** while the agent types, `src/assistant/check.ts` sends the draft to the model at most once a second (and once after the last keystroke). The answer lists the misspelled words with fixes and whether the model is sure, plus the text that continues the sentence. Sure mistakes are auto-corrected (one Ctrl/Cmd+Z each), the others are underlined with their fixes in the popover, and the continuation is shown as grey text.
- **Polish:** the button sends the same request and shows a preview (struck-through and highlighted words) that replaces every reported mistake with its first fix, whether or not the model is sure and whether or not auto-correct is on. Accept applies them like auto-correct: each fix is one Ctrl/Cmd+Z.
- **Drawing:** underlines use the CSS Custom Highlight API and the grey text is an overlay: nothing is written into the field's DOM. All model calls are in `src/assistant/server.ts`.

`CLAUDE.md` describes the layout and constraints.

## Licensing and terms

- **OpenAI API:** OpenAI terms of use. It's not shipped.
