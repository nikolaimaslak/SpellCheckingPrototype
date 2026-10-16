# SpellCheckingPrototype

Demo of **auto-complete and auto-correct** in Bright Pattern Agent Desktop, in English and Arabic: LLM spell check and auto-correct (PER #60254), Smart Compose-style inline completion (PER #60145), and a Polish button that fixes every mistake the model finds.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The demo page at http://localhost:5173 (bound to 127.0.0.1). Spelling, completion and Polish need an OpenAI API key typed on the page |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck + production build to `dist/` |

## Layout

- `index.html` + `src/app/`: the demo page, React + Tailwind: settings (in memory only, lost on reload; applied to the field 500 ms after the last change, Reset), one message field, the popover, ghost text and the Polish button drawn from the assistant's state, an on-page event log. `components/` and `hooks/` only draw and call; `lib/` holds the non-UI parts (settings, the English and Arabic LLM context presets, `ghost-layout.ts`: where the ghost text is drawn).
- `src/assistant/`: `createAssistant(field, options)` in `index.ts`, the one entry point; it keeps the state the page draws (`popover`, `ghost`, `polish`) and makes the one `AssistantContext` that holds all the assistant's data. The other modules are plain functions that take that context; none keeps its own variables.
  - `types.ts`: options, state and event types.
  - `browser.ts`: everything that touches the browser: text replace as a native undo step (`execCommand('insertText')`), selection, rects, CSS highlights.
  - `text/`: `field-text.ts` (the field's text as one string, mapped back to DOM ranges and the caret), `words.ts` (finding whole words, text direction).
  - `llm/check-request.ts`: the one prompt (mistakes with fixes and how sure, plus the completion), the one fetch to the LLM, `MODEL`, answer parsing.
  - `typing/`: `check-while-typing.ts` (`handleInput`, `handleKeyDown` and the other handlers `MessageField` calls; the throttled request; handing the answer on), `spelling.ts` (underlines, popover, auto-correct, Undo as revert), `ghost-text.ts` (the completion shown after the caret and its keys; React draws it).
  - `replace-words.ts`: replaces words in the field (one undo step each), keeps the caret, flashes the replaced words. Used by auto-correct.
  - `polish/`: `polish.ts` (the Polish button: the same check request, a preview replacing every mistake with its first fix, sure or not; Accept replaces the whole text as one undo step), `word-diff.ts` (the preview's diff).
- Code has no comments: names say what things are.

## Hard constraints

- **No browser extensions.** Everything is page code.
- **The only network calls are to OpenAI**, with the key from the page's password field (kept in memory only, never saved): the spelling and completion check, and Polish.
- **Never write decorations into the editable DOM.** Use the CSS Custom Highlight API for underlines and an overlay for ghost text. Programmatic text changes go through `replaceText` in `browser.ts`, so each one is one native undo step.
- **Licensing.** No GPL/LGPL terms. Any new dependency needs its license checked first.
- **English first, Arabic first-class.** Every text-processing behavior must work in English, Arabic and mixed text. Use `dir="auto"` / `unicode-bidi: plaintext` for direction.

## Conventions

- TypeScript strict with `erasableSyntaxOnly` (no enums, no parameter properties).
- No one-line `if` or `else`: every body goes in braces on its own line, even a single `return;` or call.
- One React component per file in `src/app/components/`, named after the component. No second component in a file, not even a small helper one.
- The page is React + Tailwind (`src/app/`). `src/assistant/` is plain TypeScript with no React.
