# SpellCheckingPrototype

Prototype of the Agent Desktop composer assistance layer: Arabic and English spell checking and auto-correct (PER #60254), and later inline completion (PER #60145). Everything spelling-related runs in the browser, in a Web Worker, with Hunspell compiled to WebAssembly and no network calls.

## Prerequisites

- Node.js 25+ and npm
- Docker, **optional**, only to rebuild the Hunspell WASM module (the build output is committed)

## Setup

```sh
npm install
npm run fetch-dicts   # English from npm; Arabic downloaded from a pinned commit (local evaluation only)
npm run dev           # http://localhost:5173
```

The demo page has a chat composer (Enter sends, Shift+Enter adds a new line) and a rich-text email composer, plus an indicator showing which dictionaries loaded. In dev, `window.spell` exposes the worker client, for example `await spell.request({ type: 'suggest', lang: 'en', word: 'recieve' })`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server with the demo page |
| `npm test` | Unit tests (Vitest). Arabic tests run only when the Arabic dictionary is provisioned |
| `npm run typecheck` | Type checking |
| `npm run build` | Production build to `dist/` |
| `npm run fetch-dicts` | Provision dictionaries (`--en-only` to skip the Arabic download) |
| `npm run build:wasm` | Recompile Hunspell to WASM in Docker (pinned tag and toolchain) |

## Licensing

- **Hunspell** (v1.7.4) is compiled to WASM and used under its **MPL 1.1** option. See `src/spell/wasm/NOTICE` and `PROVENANCE.json`.
- **English dictionary**: `dictionary-en` (SCOWL-derived), MIT AND BSD.
- **Arabic dictionary** (AyaSpell): the license is **not yet cleared**. It is downloaded into the gitignored `.local-dicts/ar/` for local evaluation only, and production builds leave it out unless `INCLUDE_AR_DICT=1` is set (which prints a warning). Do not distribute builds that include it. See `dicts/MANIFEST.md`.

## Planning

Requirements and architecture are in `docs/`. Work is planned and tracked with OpenSpec under `openspec/`.
