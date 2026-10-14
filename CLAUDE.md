# SpellCheckingPrototype

Prototype of the Bright Pattern Agent Desktop **composer assistance layer**: spell check and auto-correct (PER #60254) and Smart Compose-style inline completion (PER #60145) for tenant 2P / GOSI. Read these before designing anything:

- `docs/requirements/60145-60254-formal-requirements.md`: the **formal requirements** (authoritative where they differ from the tickets)
- `docs/requirements/gap-analysis-60145-60254.md`: how the prototype measures against them, with proposed changes and open questions
- `docs/requirements/60254-auto-correct.txt`, `docs/requirements/60145-auto-complete.txt`: the customer tickets
- `docs/ARCHITECTURE.md`: the architecture as built (tiers, modules, request flows, data handling, tooling)
- `docs/architecture/composer-assistance-architecture.txt`: the original architecture draft, from before the code (tiers, components, phases)
- `openspec/config.yaml`: project context and constraints for all planning
- `docs/known-issues.md`: deferred issues to address (check before touching auto-correct)
- `docs/sweet-vs-hunspell-analysis.md`: why Hunspell stays the spelling engine rather than the SWEET Arabic model (browser cost, fit, licensing), and what would reopen it. Background in `docs/arabic-gec-research-notes.md`, with review comments
- `docs/EVALUATION.md`: how spelling quality is measured (criteria, datasets, error types, field metrics)
- `docs/TESTING.md`: the external tester guide. Keep its scenarios and expected results in sync with behavior changes. Report template: `docs/TEST-REPORT-TEMPLATE.md`, mirrored in `.github/ISSUE_TEMPLATE/`

## Workflow

All work goes through OpenSpec changes: `/opsx:propose <name>` → review → `/opsx:apply` → `/opsx:archive`. Don't implement outside a change. Current specs are in `openspec/specs/`, and in-flight changes are in `openspec/changes/`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The demo page at http://localhost:5173 (bound to 127.0.0.1; provisions dictionaries first). Completion and Polish need an OpenAI API key typed on the page |
| `npm test` | Vitest (Node by default; DOM tests opt in with `// @vitest-environment jsdom`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck + production build to `dist/` (both dictionaries) |
| `npm run fetch-dicts` | Provision English (from npm) and Arabic (vendored `dicts/ar`, sha256-checked) into `public/dicts/`, offline |
| `npm run build:wasm` | Rebuild Hunspell WASM in Docker; only when changing the pin or `wasm/binding.cpp` |
| `npm run eval` | Spelling benchmark (offline, a few minutes): detection, correction, auto-replace, error types; writes `eval/reports/latest.md`. `eval:check` gates against `eval/baseline.json`, `eval:baseline` rewrites it. See `docs/EVALUATION.md` |
| `npm run eval:inject` / `eval:words` / `eval:build` / `eval:manifest` | Insert typed misspellings, build word lists, compile hand-marked dataset sources, re-hash the dataset manifest |
| `npm run eval:qalb -- <areta-file> --name <set> --source … --license … --license-file <path>` | Convert a QALB ARETA-tagged alignment file from `../arabic-gec` into a private spelling dataset in `eval/datasets/private/` (gitignored, aggregates only in reports, license copied beside it). Evaluation only: never commit it or build lists from it. See `docs/EVALUATION.md` |

## Layout

- `index.html` + `src/app/`: the demo page, React + Tailwind (http://localhost:5173/): settings (saved in `localStorage`, Reset), one message field, the popover, ghost text and polish preview drawn from the assistant's state, an on-page event log. `components/` and `hooks/` only draw and call; `lib/` holds the non-UI parts (settings and their mapping to assistant options, the Conversation field, the event log).
- `src/assistant/`: `createAssistant(field, options)`, the one entry point. Handles the field's events and keeps the state of what to draw (`popover`, `ghost`, `polish`). One file per feature: `spelling.ts` (spell check and auto-correct), `completion.ts` + `completion-rules.ts` (pure: when to ask, keys, ghost layout), `polish.ts` + `polish-diff.ts` + `polish-apply.ts`; `server.ts` (completion and polish: direct OpenAI calls with the key typed on the page), `highlights.ts`, `state.ts` (state, events, the browser seams tests replace).
- `src/autocorrect/`: the auto-replace decision (`confidence.ts`), misspellings lists, edit distance, typed-boundary trigger.
- `src/tokenizer/`: words with live DOM ranges, exclusions, script routing, settledness.
- `src/spell/`: the spelling engine. `engine.ts` wraps the WASM module; `handler.ts` is the pure request handler (tested in Node, used by the eval); `spell.worker.ts` is the worker shell; `checker.ts` is the page side (worker requests, language loading, custom words, cache); `protocol.ts` holds the message types; `wasm/` holds the **committed** build output, with `PROVENANCE.json` and `NOTICE`.
- `eval/`: spelling evaluation tooling, run by Node through `eval/register.ts` (resolves `src/`'s extensionless imports). `pipeline.ts` mirrors `src/assistant/spelling.ts` in typing order (`test/eval/parity.test.ts` checks they agree); `error-types.ts` is the error taxonomy and classifier; `test/fixtures/error-types.json` pins its results; `datasets/` holds the manifest-checked synthetic datasets (`private/` is gitignored); `criteria.json` and `baseline.json` drive the gate. Run `npm run eval:check` before and after any change to auto-correct.
- `wasm/`: `build.sh` (pinned Hunspell tag and emsdk digest) and `binding.cpp` (6-function C ABI).
- `scripts/fetch-dicts.ts`: dictionary provisioning (run directly by Node, no build step).
- `dicts/`: vendored Arabic dictionary (`ar/` with `NOTICE`) and `MANIFEST.md` (sources, pins, hashes, licenses).
- `test/`: mirrors `src/`, `scripts/` and `eval/` (`test/assistant/fakes.ts`: the fake checker, highlights and `testAssistant`); `test/fixtures/` holds shared fixtures. Test files run serially (`fileParallelism: false`; see KI-1).

## Hard constraints

- **No browser extensions.** Everything is page code.
- **Tier 1 never touches the network.** Only same-origin static assets (WASM, dictionaries). Engine work stays in the worker, never on the page thread. Completion and polish are the exception: the page calls OpenAI directly with the key from the page's password field (kept in `localStorage`).
- **Made-up text only with the OpenAI key.** Everything typed in the field, the conversation, canned responses and KB go to OpenAI. Events are shown on the page only.
- **Never write decorations into the editable DOM.** Use the CSS Custom Highlight API for underlines and an overlay for ghost text. Programmatic text changes go through one transaction path so a single undo reverts them.
- **Licensing.** No GPL/LGPL terms. Hunspell and the AyaSpell Arabic dictionary are both tri-licensed and used under **MPL 1.1** (notices in `src/spell/wasm/NOTICE` and `dicts/ar/NOTICE`). Any new dependency needs its license checked first.
- **English is the first language.** Delivery priority: every test and spec scenario must work in English, and every text-processing behavior has English cases.
- **Arabic is first-class.** Give every text-processing behavior Arabic and mixed Arabic/English test cases. Use `dir="auto"` / `unicode-bidi: plaintext` for direction.
- Exclude URLs, emails, reference numbers, tokens with digits, and `$(substitution.fields)` from checking.

## Conventions

- TypeScript strict with `erasableSyntaxOnly` (no enums, no parameter properties), so `scripts/*.ts` run directly under Node.
- The page is React + Tailwind (`src/app/`). Everything that isn't drawing (`src/assistant/`, `src/autocorrect/`, `src/tokenizer/`, `src/spell/`) is plain TypeScript with no React, so the eval and Node tests run it directly. npm for the page and tooling.
- Tests read dictionaries from `node_modules/dictionary-en/` and `dicts/ar/` directly.
