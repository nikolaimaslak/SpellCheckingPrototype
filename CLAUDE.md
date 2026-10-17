# SpellCheckingPrototype

Demo of **auto-completion and auto-correct** in Bright Pattern Agent Desktop, in English and Arabic: LLM spell check and auto-correct (PER #60254), and Smart Compose-style inline auto-completion (PER #60145).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The demo page at http://localhost:5173 (bound to 127.0.0.1). Spell check and auto-completion need an OpenAI API key typed on the page |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm test` | Playwright tests (`src/**/*.spec.ts`) in Chrome with a fake LLM, no key or network needed; also run in GitHub Actions |

## Layout

- `index.html` + `src/app/`: the demo page, React + Tailwind: settings spread over the page (API key at the top; context and word lists below the field; toggles in the field's header; in memory only, lost on reload; applied to the field 500 ms after the last change), one message field, the popover and auto-completion drawn from the assistant's state, the Debugger (`Debugger.tsx`: the on-page event log). `components/` and `hooks/` only draw and call; `lib/` holds the non-UI parts: settings, the English, Arabic and Russian LLM context presets, `auto-completion-layout.ts` (where the auto-completion is drawn), and the contenteditable side of the assistant: `content-editable-editor-control.ts` (the `EditorControl` for a contenteditable div), `field-text.ts` (the field's text as one string, mapped back to DOM ranges and the caret), `openai-llm-client.ts` (the demo's `LLMClient`: OpenAI chat completions, `MODEL`, the key from the page), `browser.ts` (text replace as a native undo step with `execCommand('insertText')`, selection, rects, CSS highlights).
- `src/assistant/`: the part that is reused in other editors (a contenteditable div, a WYSIWYG editor). It never touches the DOM: the host passes an `EditorControl` (get and replace the text by offsets, get and set the caret, show underlines and flash the auto-corrected words) and an `LLMClient` (`ask(messages, signal)`: sends the chat messages to whatever LLM the host uses and returns `{ answer }` or `{ error }`), and calls the handlers with plain key and input objects. The assistant owns the prompts, the parsing and the 5 s timeout; the host owns the transport (model, key, endpoint). `createAssistant(editorControl, options)` in `index.ts` is the one entry point; it keeps the state the page draws (`popover`, `autoCompletion`, `requestStatus`) and makes the one `AssistantContext` that holds all the assistant's data. The other modules are plain functions that take that context; none keeps its own variables.
  - `types.ts`: the `EditorControl` interface, options, state and event types.
  - `words.ts`: finding whole words, text direction. `mistake-places.ts`: where the model's mistakes are in the text.
  - `llm.ts`: the two requests, sent in parallel after the same pause in typing (spell check: mistakes with fixes and how sure; auto-completion: the next sentence at the caret), the call to the `LLMClient` with its timeout, building the user messages, answer parsing. `spell-check-prompt.ts` and `auto-completion-prompt.ts`: each request's system message and examples.
  - `check-while-typing.ts`: `handleInput`, `handleKeyDown` and the other handlers the host calls; the throttled request; handing the answers on.
  - `spell-check.ts`: underlines, popover, auto-correct with each fixed word as one undo step, keeping the caret and flashing the auto-corrected words, undo and redo of an auto-correction.
  - `auto-completion.ts`: the auto-completion shown after the caret and its keys; the host draws it.
- Tests sit next to the file they test, as `<file>.spec.ts`. In `src/assistant/` they run in Node, so with no DOM: the pure functions, and `index.spec.ts` drives the assistant through an in-memory `EditorControl`. `src/app/lib/field-text.spec.ts` reads a real contenteditable in the browser. `src/app/App*.spec.ts` open the whole page with a fake LLM (`src/app/demo-page.ts`): the page, spell check, auto-completion.
- Code has no comments: names say what things are.

## Hard constraints

- **No browser extensions.** Everything is page code.
- **The only network calls are to OpenAI**, made by the demo's `LLMClient` (`src/app/lib/openai-llm-client.ts`) with the key from the page's password field (kept in memory only, never saved): the spell check and the auto-completion. `src/assistant/` makes no network calls itself.
- **Never write decorations into the editable DOM.** Use the CSS Custom Highlight API for underlines and an overlay for auto-completion. The assistant changes text only through `EditorControl.replaceText`, and each call must be one native undo step (the contenteditable `EditorControl` uses `replaceText` in `src/app/lib/browser.ts`).
- **`src/assistant/` never touches the DOM**: no `document`, `window`, DOM nodes, ranges or DOM events. Everything it needs comes through `EditorControl` and the handler arguments.
- **Licensing.** No GPL/LGPL terms. Any new dependency needs its license checked first.
- **English first, Arabic first-class.** Every text-processing behavior must work in English, Arabic and mixed text. Use `dir="auto"` / `unicode-bidi: plaintext` for direction.

## Conventions

- TypeScript strict with `erasableSyntaxOnly` (no enums, no parameter properties).
- No one-line `if` or `else`: every body goes in braces on its own line, even a single `return;` or call.
- Boolean names start with `is`, `has`, `should`, `with`, `can` or a similar word (`isSure`, `withAutoCompletion`, `shouldReturnCaret`). The only exceptions are names fixed by something outside the code: the LLM's JSON keys and library options.
- No more than 2 keys on one line: an object literal or object type with 3 or more keys puts each key on its own line.
- One React component per file in `src/app/components/`, named after the component. No second component in a file, not even a small helper one.
- The page is React + Tailwind (`src/app/`). `src/assistant/` is plain TypeScript with no React.
