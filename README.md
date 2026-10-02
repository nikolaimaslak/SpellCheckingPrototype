# SpellCheckingPrototype

Prototype of the Agent Desktop composer assistance layer: Arabic and English spell checking and auto-correct (PER #60254), and Smart Compose-style inline completion (PER #60145). Spelling runs entirely in the browser (Hunspell compiled to WebAssembly, in a Web Worker, no network calls). Completion is server-side: a dev server stands in for the Intelligence Engine and calls a hosted model (Gemini in dev).

## Prerequisites

- Node.js 25+ and npm
- Docker, **optional**, only to rebuild the Hunspell WASM module (the build output is committed)
- A Gemini API key, **optional**, only for live inline completion (`COMPLETION_MODEL=fake` works without one)

## Setup

```sh
npm install
npm run fetch-dicts   # English from npm, Arabic from dicts/ar (offline; also runs before dev/test/build)
npm run dev           # http://localhost:5173
```

For inline completion, also start the completion server in a second terminal:

```sh
echo 'GEMINI_API_KEY=your-key' > .env    # gitignored; or: export GEMINI_API_KEY=...
npm run server                          # :5175, proxied to the demo as /api
COMPLETION_MODEL=fake npm run server    # offline, deterministic test double (no key)
```

The demo page has a chat composer (Enter sends, Shift+Enter adds a new line, like Agent Desktop) and a rich-text email composer.
- **Settings panel:** stands in for the admin and agent settings (spelling mode, custom dictionary, completion for everyone or listed teams and users).
- **Customer conversation:** a scripted customer side, in English or Arabic, gives completions context.
- **Telemetry summary:** the link (`/api/summary`) shows completion acceptance, latency and auto-correct revert rate.

**Data handling:** completion requests (recent conversation, canned snippets, the agent's sentence) go to the hosted model. Use synthetic text only. Telemetry records no conversation or completion text.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server with the demo page |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | Type checking |
| `npm run build` | Production build to `dist/` |
| `npm run fetch-dicts` | Provision both dictionaries into `public/dicts/` (offline) |
| `npm run build:wasm` | Recompile Hunspell to WASM in Docker (pinned tag and toolchain) |
| `npm run server` | Completion and telemetry server (`GEMINI_API_KEY`, `COMPLETION_MODEL=gemini\|fake`, `PORT`) |
| `npm run ad-loader` | Dev-only loader for a live Agent Desktop tenant |

## Licensing and terms

- **Hunspell** (v1.7.4) is compiled to WASM and used under its **MPL 1.1** option. See `src/spell/wasm/NOTICE` and `PROVENANCE.json`.
- **English dictionary**: `dictionary-en` (SCOWL-derived), MIT AND BSD.
- **Gemini API** (dev completion only): Google APIs Terms of Service and Gemini API Additional Terms. It's not shipped.
- **Arabic dictionary** (AyaSpell): tri-licensed GPL-2+ / LGPL-2.1+ / MPL-1.1; this project elects **MPL 1.1**. Vendored unmodified in `dicts/ar/` with a `NOTICE`; hashes pinned. See `dicts/MANIFEST.md`.

## Planning

Requirements and architecture are in `docs/`. Work is planned and tracked with OpenSpec under `openspec/`.
