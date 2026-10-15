# SpellCheckingPrototype

Demo of **auto-complete and auto-correct** in Bright Pattern Agent Desktop, in English and Arabic: LLM spell check and auto-correct (PER #60254), Smart Compose-style inline completion (PER #60145), and a Polish button that fixes every mistake the model finds.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The demo page at http://localhost:5173 (bound to 127.0.0.1). Spelling, completion and Polish need an OpenAI API key typed on the page |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck + production build to `dist/` |

## Layout

- `index.html` + `src/app/`: the demo page, React + Tailwind: settings (saved in `localStorage`, Reset), one message field, the popover, ghost text and the Polish button drawn from the assistant's state, an on-page event log. `components/` and `hooks/` only draw and call; `lib/` holds the non-UI parts (settings and their mapping to assistant options, the Conversation field, the event log, the default canned responses and KB from `data/`, `ghost-layout.ts`: where the ghost text is drawn).
- `src/assistant/`: `createAssistant(field, options)` in `index.ts`, the one entry point; it keeps the state the page draws (`popover`, `ghost`, `polish`).
  - `types.ts`: options, state and event types.
  - `browser.ts`: everything that touches the browser: text replace as a native undo step (`execCommand('insertText')`), selection, rects, CSS highlights.
  - `text/`: `field-text.ts` (the field's text as one string, mapped back to DOM ranges and the caret), `words.ts` (finding whole words, text direction).
  - `openai/`: `client.ts` (the one fetch to OpenAI, `MODEL`), `check-request.ts` (the one prompt: mistakes with fixes and how sure, plus the completion; answer parsing).
  - `typing/`: `typing-assist.ts` (`handleInput`, `handleKeyDown` and the other handlers `MessageField` calls; the throttled request; handing the answer on), `spelling.ts` (underlines, popover, auto-correct, Undo as revert), `ghost-text.ts` + `ghost-text-rules.ts` (the completion shown after the caret and its keys; React draws it).
  - `replace-words.ts`: replaces words in the field (one undo step each), keeps the caret, flashes the replaced words. Used by auto-correct and Polish.
  - `polish/`: `polish.ts` (the Polish button: the same check request, a preview replacing every mistake with its first fix, sure or not; Accept applies it through `replace-words.ts`), `word-diff.ts` (the preview's diff).
- Code has no comments: names say what things are.

## Hard constraints

- **No browser extensions.** Everything is page code.
- **The only network calls are to OpenAI**, with the key from the page's password field (kept in `localStorage`): the spelling and completion check, and Polish.
- **Never write decorations into the editable DOM.** Use the CSS Custom Highlight API for underlines and an overlay for ghost text. Programmatic text changes go through `replaceText` in `browser.ts`, so each one is one native undo step.
- **Licensing.** No GPL/LGPL terms. Any new dependency needs its license checked first.
- **English first, Arabic first-class.** Every text-processing behavior must work in English, Arabic and mixed text. Use `dir="auto"` / `unicode-bidi: plaintext` for direction.

## Conventions

- TypeScript strict with `erasableSyntaxOnly` (no enums, no parameter properties).
- No one-line `if (...) return;`, `continue;`, `break;` or `throw`: always put the body in braces on its own line.
- One React component per file in `src/app/components/`, named after the component. No second component in a file, not even a small helper one.
- The page is React + Tailwind (`src/app/`). `src/assistant/` is plain TypeScript with no React.
