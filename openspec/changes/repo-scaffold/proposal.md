# Proposal

## Why

The repository is empty apart from the source documents and an installed `package.json`. Before any Phase 1 work (spell check, PER #60254), the toolchain itself has to work: Hunspell has to compile to WebAssembly from a pinned upstream tag, run in a Web Worker under Vite, load English and Arabic dictionaries, and do this without breaking the licensing rules (no GPL/LGPL, Arabic dictionary for local evaluation only). Proving that end to end now removes the riskiest unknowns from Phase 1 and gives every later change a working demo page and test setup to build on.

**Serves:** infrastructure for PER #60254 and PER #60145 (prerequisite for delivery phase 1).

## What Changes

- **Project tooling**: TypeScript (strict) config, Vite config with ES-module workers, Vitest config (node + jsdom environments), npm scripts, `.gitignore`, `.editorconfig`.
- **Hunspell → WASM build**: `wasm/build.sh` compiles Hunspell at a pinned tag inside the pinned `emscripten/emsdk` Docker image, together with a small C binding (create / spell / suggest / add word / destroy). The generated `.wasm` and JS loader are committed so the project runs without Docker. The build writes down the upstream tag, emsdk version and output hashes.
- **Dictionary provisioning**: `scripts/fetch-dicts.ts` installs the English dictionary from the `dictionary-en` npm package, and fetches the Arabic (AyaSpell) pair from a pinned LibreOffice `dictionaries` commit into a gitignored folder, for local evaluation only. A production build leaves Arabic out unless the build is explicitly told to include it.
- **Minimal spelling worker**: a Web Worker that loads the WASM module and one or more dictionaries and answers `spell` / `suggest` messages. Phase 1 builds on this, so this change keeps it to the smallest surface that proves the toolchain.
- **Demo harness**: `index.html` with a chat composer (Enter sends into a transcript) and a rich-text email composer (`contenteditable`). Both use `dir="auto"` so Arabic renders RTL. An engine status indicator shows when the worker is ready and which dictionaries loaded.
- **Source layout**: empty module folders for the components named in the architecture doc (`composer`, `tokenizer`, `spell`, `autocorrect`, `demo`), so later changes have an agreed home.
- **Agent and developer docs**: `CLAUDE.md` (constraints, commands, layout, OpenSpec workflow) and `README.md` (setup and scripts).
- Already done before this change (to verify, not redo): `package.json` with dev dependencies, and the source documents copied to `docs/` with `.txt` extracts.

## Non-goals

- No tokenizer, exclusion rules, Arabic normalization, underlines, popovers or auto-correct. These are Phase 1 and Phase 2 changes.
- No Tier 2: no completion endpoint, LLM calls or grammar action.
- No admin configuration model or privileges.
- No CI pipeline. The WASM build is reproducible locally through Docker; wiring it into CI comes later.
- No decision on Arabic dictionary licensing. This change only keeps the Arabic data out of git and out of distributable builds until legal clears it.

## New third-party dependencies

| Dependency | Use | License | Shipped? |
|---|---|---|---|
| Hunspell (pinned tag, vendored at build time) | spelling engine, compiled to WASM | MPL 1.1 / GPL 2 / LGPL 2.1 tri-license; **MPL 1.1 elected** | yes (compiled) |
| `emscripten/emsdk` Docker image | build-time compiler | MIT / UIUC | no |
| `dictionary-en` (npm) | English `.aff`/`.dic` (SCOWL-derived) | MIT AND BSD | yes |
| AyaSpell Arabic `.aff`/`.dic` via LibreOffice `dictionaries` | Arabic dictionary | **unclear — open legal item** | **no** (local evaluation only) |
| `vite`, `vitest`, `typescript`, `jsdom`, `@types/node` (npm, dev) | tooling | MIT / Apache-2.0 | no |

## Capabilities

### New Capabilities
- `hunspell-wasm-build`: reproducible compilation of pinned Hunspell to a WASM module with a minimal binding, usable from browser workers and from Node tests.
- `dictionary-provisioning`: how English and Arabic dictionaries are obtained, where they live, and the licensing guard that keeps Arabic out of git and out of distributable builds.
- `spelling-worker`: the minimal Web Worker protocol (load dictionaries, spell, suggest) that runs entirely offline.
- `demo-harness`: the demo page with chat and email stand-in composers used to exercise every later phase manually.

### Modified Capabilities
- None. No specs exist yet.

## Impact

- New files: `tsconfig.json`, `vite.config.ts`, `index.html`, `src/**`, `wasm/**`, `scripts/fetch-dicts.ts`, `public/dicts/**` (English only in git), `test/**`, `CLAUDE.md`, `README.md`, `.gitignore`, `.editorconfig`.
- Build-time requirement: Docker, only for regenerating the WASM module. Day-to-day work needs only Node and npm.
- Network: `fetch-dicts` reaches GitHub (LibreOffice dictionaries) once, at setup. The runtime makes no network calls beyond loading same-origin static assets.
