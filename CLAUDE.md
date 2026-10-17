# SpellCheckingPrototype

Demo of **auto-complete and auto-correct** in Bright Pattern Agent Desktop, in English and Arabic: LLM spell check and auto-correct (PER #60254), and Smart Compose-style inline completion (PER #60145).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The demo page at http://localhost:5173 (bound to 127.0.0.1). Spelling and completion need an OpenAI API key typed on the page |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm test` | Playwright tests in Chrome with a fake LLM (`tests/`), no key or network needed; also run in GitHub Actions |

## Layout

- `index.html` + `src/app/`: the demo page, React + Tailwind: settings spread over the page (API key at the top; context and word lists below the field; toggles in the field's header; in memory only, lost on reload; applied to the field 500 ms after the last change), one message field, the popover and ghost text drawn from the assistant's state, an on-page event log. `components/` and `hooks/` only draw and call; `lib/` holds the non-UI parts (settings, the English and Arabic LLM context presets, `ghost-layout.ts`: where the ghost text is drawn).
- `src/assistant/`: `createAssistant(field, options)` in `index.ts`, the one entry point; it keeps the state the page draws (`popover`, `ghost`, `loader`) and makes the one `AssistantContext` that holds all the assistant's data. The other modules are plain functions that take that context; none keeps its own variables.
  - `types.ts`: options, state and event types.
  - `browser.ts`: everything that touches the browser: text replace as a native undo step (`execCommand('insertText')`), selection, rects, CSS highlights.
  - `text/`: `field-text.ts` (the field's text as one string, mapped back to DOM ranges and the caret), `words.ts` (finding whole words, text direction).
  - `llm.ts`: the two requests, sent in parallel after the same pause in typing (spelling: mistakes with fixes and how sure; completion: the next sentence at the caret), the fetch to the LLM, `MODEL`, building the user messages, answer parsing. `spelling-prompt.ts` and `completion-prompt.ts`: each request's system message and examples.
  - `typing/`: `check-while-typing.ts` (`handleInput`, `handleKeyDown` and the other handlers `MessageField` calls; the throttled request; handing the answer on), `spelling.ts` (underlines, popover, auto-correct with each replaced word as one undo step, keeping the caret and flashing the replaced words, Undo as revert), `ghost-text.ts` (the completion shown after the caret and its keys; React draws it).
- `tests/`: Playwright tests. `demo-page.ts` opens the page with a fake LLM; `*.spec.ts` cover ghost text, spelling, the page, reading the field's text (in the browser) and the pure text functions (in Node).
- Code has no comments: names say what things are.

## Hard constraints

- **No browser extensions.** Everything is page code.
- **The only network calls are to OpenAI**, with the key from the page's password field (kept in memory only, never saved): the spelling check and the completion.
- **Never write decorations into the editable DOM.** Use the CSS Custom Highlight API for underlines and an overlay for ghost text. Programmatic text changes go through `replaceText` in `browser.ts`, so each one is one native undo step.
- **Licensing.** No GPL/LGPL terms. Any new dependency needs its license checked first.
- **English first, Arabic first-class.** Every text-processing behavior must work in English, Arabic and mixed text. Use `dir="auto"` / `unicode-bidi: plaintext` for direction.

## Conventions

- TypeScript strict with `erasableSyntaxOnly` (no enums, no parameter properties).
- No one-line `if` or `else`: every body goes in braces on its own line, even a single `return;` or call.
- Boolean names start with `is`, `has`, `should`, `with`, `can` or a similar word (`isSure`, `withCompletion`, `shouldReturnCaret`). The only exceptions are names fixed by something outside the code: the LLM's JSON keys and library options.
- No more than 2 keys on one line: an object literal or object type with 3 or more keys puts each key on its own line.
- One React component per file in `src/app/components/`, named after the component. No second component in a file, not even a small helper one.
- The page is React + Tailwind (`src/app/`). `src/assistant/` is plain TypeScript with no React.
