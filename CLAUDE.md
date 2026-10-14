# SpellCheckingPrototype

Demo of the Bright Pattern Agent Desktop **composer assistance layer**, in English and Arabic: LLM spell check and auto-correct (PER #60254), Smart Compose-style inline completion (PER #60145), and an on-demand grammar polish.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The demo page at http://localhost:5173 (bound to 127.0.0.1). Spelling, completion and Polish need an OpenAI API key typed on the page |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck + production build to `dist/` |

## Layout

- `index.html` + `src/app/`: the demo page, React + Tailwind: settings (saved in `localStorage`, Reset), one message field, the popover, ghost text and polish preview drawn from the assistant's state, an on-page event log. `components/` and `hooks/` only draw and call; `lib/` holds the non-UI parts (settings and their mapping to assistant options, the Conversation field, the event log, the default canned responses and KB from `data/`).
- `src/assistant/`: `createAssistant(field, options)`, the one entry point; it keeps the state of what to draw (`popover`, `ghost`, `polish`) and the browser parts (`AssistantEnv`).
  - `check.ts`: while the agent types, one throttled request to the model for both spelling and completion. Underlines the mistakes with their fixes in the popover, auto-corrects the ones the model is sure about (an Undo that brings a word back marks it ignored), and shows the completion as ghost text.
  - `completion-rules.ts`: pure rules: when to ask for a completion, what a key does with ghost text, where to draw it.
  - `polish.ts` + `polish-diff.ts`: the Polish button: the preview diff, and Accept as one replace of the whole draft.
  - `server.ts`: the OpenAI calls with the key typed on the page, the prompts and answer parsing.
  - `textmap.ts`: the field's text flattened to one string, mapped back to DOM ranges.
  - `highlights.ts`, `state.ts`: the CSS highlights; state and event types.

## Hard constraints

- **No browser extensions.** Everything is page code.
- **The only network calls are to OpenAI**, with the key from the page's password field (kept in `localStorage`): the spelling and completion check, and Polish.
- **Made-up text only with the OpenAI key.** Everything typed in the field, the conversation, canned responses and KB go to OpenAI. Events are shown on the page only.
- **Never write decorations into the editable DOM.** Use the CSS Custom Highlight API for underlines and an overlay for ghost text. Programmatic text changes go through `env.replace` (`execCommand('insertText')`), so each one is one native undo step.
- **Licensing.** No GPL/LGPL terms. Any new dependency needs its license checked first.
- **English first, Arabic first-class.** Every text-processing behavior must work in English, Arabic and mixed text. Use `dir="auto"` / `unicode-bidi: plaintext` for direction.

## Conventions

- TypeScript strict with `erasableSyntaxOnly` (no enums, no parameter properties).
- The page is React + Tailwind (`src/app/`). `src/assistant/` is plain TypeScript with no React.
