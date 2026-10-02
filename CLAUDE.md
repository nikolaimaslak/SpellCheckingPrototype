# SpellCheckingPrototype

Prototype of the Bright Pattern Agent Desktop **composer assistance layer**: spell check and auto-correct (PER #60254) and Smart Compose-style inline completion (PER #60145) for tenant 2P / GOSI. Read these before designing anything:

- `docs/requirements/60254-auto-correct.txt`, `docs/requirements/60145-auto-complete.txt`: the customer tickets
- `docs/architecture/composer-assistance-architecture.txt`: the architecture draft (tiers, components, phases)
- `openspec/config.yaml`: project context and constraints for all planning
- `docs/known-issues.md`: deferred issues to address (check before touching auto-correct)

## Workflow

All work goes through OpenSpec changes: `/opsx:propose <name>` → review → `/opsx:apply` → `/opsx:archive`. Don't implement outside a change. Current specs are in `openspec/specs/`, and in-flight changes are in `openspec/changes/`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Demo page at http://localhost:5173 (provisions English first) |
| `npm test` | Vitest (Node by default; DOM tests opt in with `// @vitest-environment jsdom`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck + production build to `dist/` (both dictionaries) |
| `npm run fetch-dicts` | Provision English (from npm) and Arabic (vendored `dicts/ar`, sha256-checked) into `public/dicts/`, offline |
| `npm run build:wasm` | Rebuild Hunspell WASM in Docker; only when changing the pin or `wasm/binding.cpp` |

## Layout

- `src/spell/`: Tier 1 spelling engine. `engine.ts` wraps the WASM module; `handler.ts` is the pure request handler (tested in Node); `spell.worker.ts` is the worker shell; `client.ts` is the page-side client; `protocol.ts` holds the message types; `wasm/` holds the **committed** build output, with `PROVENANCE.json` and `NOTICE`.
- `src/composer/`, `src/tokenizer/`, `src/autocorrect/`: Tier 1 components, empty until Phase 1/2 (see each README).
- `src/demo/` + `index.html`: stand-in chat (`contenteditable="plaintext-only"`) and email (`contenteditable`) composers, plus the engine status indicator.
- `wasm/`: `build.sh` (pinned Hunspell tag and emsdk digest) and `binding.cpp` (6-function C ABI).
- `scripts/fetch-dicts.ts`: dictionary provisioning (run directly by Node, no build step).
- `dicts/`: vendored Arabic dictionary (`ar/` with `NOTICE`) and `MANIFEST.md` (sources, pins, hashes, licenses).
- `test/`: mirrors `src/` and `scripts/`.

## Hard constraints

- **No browser extensions.** Everything is page code.
- **Tier 1 never touches the network.** Only same-origin static assets (WASM, dictionaries). Engine work stays in the worker, never on the page thread.
- **Never write decorations into the editable DOM.** Use the CSS Custom Highlight API for underlines and an overlay for ghost text. Programmatic text changes go through one transaction path so a single undo reverts them.
- **Licensing.** No GPL/LGPL terms. Hunspell and the AyaSpell Arabic dictionary are both tri-licensed and used under **MPL 1.1** (notices in `src/spell/wasm/NOTICE` and `dicts/ar/NOTICE`). Any new dependency needs its license checked first.
- **Arabic is first-class.** Give every text-processing behavior Arabic and mixed Arabic/English test cases. Use `dir="auto"` / `unicode-bidi: plaintext` for direction.
- Exclude URLs, emails, reference numbers, tokens with digits, and `$(substitution.fields)` from checking.

## Conventions

- TypeScript strict with `erasableSyntaxOnly` (no enums, no parameter properties), so `scripts/*.ts` run directly under Node.
- Vanilla DOM, no UI framework, npm only.
- Tests read dictionaries from `node_modules/dictionary-en/` and `dicts/ar/` directly.
