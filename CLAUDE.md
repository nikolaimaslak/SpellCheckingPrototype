# SpellCheckingPrototype

Prototype of the Bright Pattern Agent Desktop **composer assistance layer**: LLM spell check and auto-correct (PER #60254) and Smart Compose-style inline completion (PER #60145) for tenant 2P / GOSI. Read these before designing anything:

- `docs/requirements/60145-60254-formal-requirements.md`: the **formal requirements** (authoritative where they differ from the tickets)
- `docs/requirements/gap-analysis-60145-60254.md`: how the prototype measures against them, with proposed changes and open questions
- `docs/requirements/60254-auto-correct.txt`, `docs/requirements/60145-auto-complete.txt`: the customer tickets
- `docs/ARCHITECTURE.md`: the architecture as built (tiers, modules, request flows, data handling, tooling)
- `docs/architecture/composer-assistance-architecture.txt`: the original architecture draft, from before the code (tiers, components, phases)
- `openspec/config.yaml`: project context and constraints for all planning
- `docs/known-issues.md`: deferred issues to address
- `docs/TESTING.md`: the external tester guide. Keep its scenarios and expected results in sync with behavior changes. Report template: `docs/TEST-REPORT-TEMPLATE.md`, mirrored in `.github/ISSUE_TEMPLATE/`

## Workflow

All work goes through OpenSpec changes: `/opsx:propose <name>` → review → `/opsx:apply` → `/opsx:archive`. Don't implement outside a change. Current specs are in `openspec/specs/`, and in-flight changes are in `openspec/changes/`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The demo page at http://localhost:5173 (bound to 127.0.0.1). Spelling, completion and Polish need an OpenAI API key typed on the page |
| `npm test` | Vitest (Node by default; DOM tests opt in with `// @vitest-environment jsdom`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck + production build to `dist/` |

## Layout

- `index.html` + `src/app/`: the demo page, React + Tailwind (http://localhost:5173/): settings (saved in `localStorage`, Reset), one message field, the popover, ghost text and polish preview drawn from the assistant's state, an on-page event log. `components/` and `hooks/` only draw and call; `lib/` holds the non-UI parts (settings and their mapping to assistant options, the Conversation field, the event log).
- `src/assistant/`: `createAssistant(field, options)`, the one entry point. Handles the field's events and keeps the state of what to draw (`popover`, `ghost`, `polish`). `check.ts` sends one throttled request to the model for both spelling and completion and hands the answer to `spelling.ts` (underlines, popover fixes, auto-correct of the mistakes the model is sure about, Undo as revert) and `completion.ts` + `completion-rules.ts` (pure: when to ask, keys, ghost layout); `polish.ts` + `polish-diff.ts` + `polish-apply.ts`; `server.ts` (the OpenAI calls with the key typed on the page, prompts and answer parsing), `highlights.ts`, `state.ts` (state, events, the browser seams tests replace).
- `src/tokenizer/`: words with live DOM ranges, exclusions (URLs, emails, digits, placeholders), script routing (`Lang`), the word at the caret (`pending`).
- `test/`: mirrors `src/` (`test/assistant/fakes.ts`: the fake highlights, `silentServer` and `testAssistant`).

## Hard constraints

- **No browser extensions.** Everything is page code.
- **The only network calls are to OpenAI**, with the key from the page's password field (kept in `localStorage`): the spelling and completion check, and Polish.
- **Made-up text only with the OpenAI key.** Everything typed in the field, the conversation, canned responses and KB go to OpenAI. Events are shown on the page only.
- **Never write decorations into the editable DOM.** Use the CSS Custom Highlight API for underlines and an overlay for ghost text. Programmatic text changes go through one transaction path so a single undo reverts them.
- **Licensing.** No GPL/LGPL terms. Any new dependency needs its license checked first.
- **English is the first language.** Delivery priority: every test and spec scenario must work in English, and every text-processing behavior has English cases.
- **Arabic is first-class.** Give every text-processing behavior Arabic and mixed Arabic/English test cases. Use `dir="auto"` / `unicode-bidi: plaintext` for direction.
- Exclude URLs, emails, reference numbers, tokens with digits, and `$(substitution.fields)` from checking.

## Conventions

- TypeScript strict with `erasableSyntaxOnly` (no enums, no parameter properties).
- The page is React + Tailwind (`src/app/`). Everything that isn't drawing (`src/assistant/`, `src/tokenizer/`) is plain TypeScript with no React, so tests run it without a page. npm for the page and tooling.
