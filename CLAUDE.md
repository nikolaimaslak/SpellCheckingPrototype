# SpellCheckingPrototype

Prototype of the Bright Pattern Agent Desktop **composer assistance layer**: spell check and auto-correct (PER #60254) and Smart Compose-style inline completion (PER #60145) for tenant 2P / GOSI. Read these before designing anything:

- `docs/requirements/60145-60254-formal-requirements.md`: the **formal requirements** (authoritative where they differ from the tickets)
- `docs/requirements/gap-analysis-60145-60254.md`: how the prototype measures against them, with proposed changes and open questions
- `docs/requirements/60254-auto-correct.txt`, `docs/requirements/60145-auto-complete.txt`: the customer tickets
- `docs/architecture/composer-assistance-architecture.txt`: the architecture draft (tiers, components, phases)
- `openspec/config.yaml`: project context and constraints for all planning
- `docs/known-issues.md`: deferred issues to address (check before touching auto-correct)
- `docs/EVALUATION.md`: how spelling quality is measured (criteria, datasets, error types, field metrics)
- `docs/TESTING.md`: the external tester guide. Keep its scenarios and expected results in sync with behavior changes. Report template: `docs/TEST-REPORT-TEMPLATE.md`, mirrored in `.github/ISSUE_TEMPLATE/`

## Workflow

All work goes through OpenSpec changes: `/opsx:propose <name>` → review → `/opsx:apply` → `/opsx:archive`. Don't implement outside a change. Current specs are in `openspec/specs/`, and in-flight changes are in `openspec/changes/`.

## Commands

| Command | What it does |
|---|---|
| `npm run demo` | Testers' one-command start: checks Node and ports, runs the demo page (:5173) and completion server (:5175), prints the URL and active model |
| `npm run dev` | Demo page only, at http://localhost:5173 (bound to 127.0.0.1; provisions dictionaries first) |
| `npm test` | Vitest (Node by default; DOM tests opt in with `// @vitest-environment jsdom`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck + production build to `dist/` (both dictionaries) |
| `npm run fetch-dicts` | Provision English (from npm) and Arabic (vendored `dicts/ar`, sha256-checked) into `public/dicts/`, offline |
| `npm run build:wasm` | Rebuild Hunspell WASM in Docker; only when changing the pin or `wasm/binding.cpp` |
| `npm run server` | Completion, polish and telemetry server on 127.0.0.1:5175. `COMPLETION_MODEL=auto` (default: Gemini with `GEMINI_API_KEY`, else the offline test model), `gemini` or `fake`. The demo reaches it via the Vite `/api` proxy |
| `npm run eval` | Spelling benchmark (offline, a few minutes): detection, correction, auto-replace, error types; writes `eval/reports/latest.md`. `eval:check` gates against `eval/baseline.json`, `eval:baseline` rewrites it. See `docs/EVALUATION.md` |
| `npm run eval:inject` / `eval:words` / `eval:build` / `eval:manifest` | Insert typed misspellings, build word lists, compile hand-marked dataset sources, re-hash the dataset manifest |
| `npm run ad-loader` | Dev-only loader for trying the layer on a live Agent Desktop tenant (see `dev/ad-loader/loader.ts`) |

## Layout

- `src/spell/`: Tier 1 spelling engine. `engine.ts` wraps the WASM module; `handler.ts` is the pure request handler (tested in Node); `spell.worker.ts` is the worker shell; `client.ts` is the page-side client; `protocol.ts` holds the message types; `wasm/` holds the **committed** build output, with `PROVENANCE.json` and `NOTICE`.
- `src/tokenizer/`: words with live DOM ranges, exclusions, script routing, settledness.
- `src/composer/`: spell check and auto-correct attached to any `contenteditable` (highlights, popover, revert). See its README.
- `src/autocorrect/`: confidence rule, edit distance, typed-boundary trigger.
- `src/completion/`: inline completion client (trigger, ghost overlay, controller).
- `src/polish/`: grammar polish client (word diff, apply/revert, button and preview panel, controller).
- `src/policy/`: admin policy and agent preference (`resolveMode`, `resolveCompletion`).
- `src/telemetry/`: batching client for assistance events.
- `src/demo/` + `index.html`: stand-in chat (rich `contenteditable`, like Agent Desktop) and email composers, scripted customer conversation, settings panel, status and event counter.
- `server/`: Tier 2 dev stand-in: completion (`/v1/complete`, retrieval over the synthetic `server/data/canned.json` and the synthetic knowledge base `server/data/kb.json`), grammar polish (`/v1/polish` with protected-content, length and line-break checks), Gemini client, telemetry log and `/summary`. TypeScript run directly by Node, so its relative imports use `.ts` extensions and it doesn't import `src/`.
- `eval/`: spelling evaluation tooling, run by Node through `eval/register.ts` (resolves `src/`'s extensionless imports). `pipeline.ts` mirrors the composer in typing order; `error-types.ts` is the shared error taxonomy and classifier (also imported by `server/telemetry.ts`); `datasets/` holds the manifest-checked synthetic datasets (`private/` is gitignored); `criteria.json` and `baseline.json` drive the gate. Run `npm run eval:check` before and after any change to auto-correct.
- `dev/ad-loader/`: dev-only loader for a live Agent Desktop tenant; never part of the build.
- `wasm/`: `build.sh` (pinned Hunspell tag and emsdk digest) and `binding.cpp` (6-function C ABI).
- `scripts/fetch-dicts.ts`: dictionary provisioning (run directly by Node, no build step).
- `dicts/`: vendored Arabic dictionary (`ar/` with `NOTICE`) and `MANIFEST.md` (sources, pins, hashes, licenses).
- `test/`: mirrors `src/`, `server/`, `scripts/` and `eval/`. Test files run serially (`fileParallelism: false`; see KI-1).

## Hard constraints

- **No browser extensions.** Everything is page code.
- **Tier 1 never touches the network.** Only same-origin static assets (WASM, dictionaries). Engine work stays in the worker, never on the page thread. Completion (Tier 2) is the exception, and only to our own service.
- **Secrets stay server-side.** `GEMINI_API_KEY` only in the server environment or gitignored `.env`. Hosted-model traffic is for synthetic demo data only. Telemetry never stores completion, transcript or composer text (server allowlist).
- **Never write decorations into the editable DOM.** Use the CSS Custom Highlight API for underlines and an overlay for ghost text. Programmatic text changes go through one transaction path so a single undo reverts them.
- **Licensing.** No GPL/LGPL terms. Hunspell and the AyaSpell Arabic dictionary are both tri-licensed and used under **MPL 1.1** (notices in `src/spell/wasm/NOTICE` and `dicts/ar/NOTICE`). Any new dependency needs its license checked first.
- **Arabic is first-class.** Give every text-processing behavior Arabic and mixed Arabic/English test cases. Use `dir="auto"` / `unicode-bidi: plaintext` for direction.
- Exclude URLs, emails, reference numbers, tokens with digits, and `$(substitution.fields)` from checking.

## Conventions

- TypeScript strict with `erasableSyntaxOnly` (no enums, no parameter properties), so `scripts/*.ts` run directly under Node.
- Vanilla DOM, no UI framework, npm only.
- Tests read dictionaries from `node_modules/dictionary-en/` and `dicts/ar/` directly.
