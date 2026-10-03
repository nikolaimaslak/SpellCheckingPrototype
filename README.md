# Composer assistance prototype

Prototype of writing help for Bright Pattern Agent Desktop's chat and email composers, in **Arabic and English**:
- **Spell checking and auto-correct** (PER #60254), entirely in the browser.
- **Smart Compose-style inline completion**, grounded in the conversation, canned responses and a knowledge base (PER #60145).
- An on-demand **grammar polish** button (PER #60254).

## Quick start (testers)

You need **Node.js 23.6 or newer** (`node --version`) and a current **Chrome or Edge** (Safari 17.2+ and Firefox 140+ also work).

```sh
npm install
npm run demo
```

Then open **http://localhost:5173/** and follow the **[tester guide](docs/TESTING.md)**: scenarios, what to type, and what you should see. Stop the demo with **Ctrl+C**.

**Which model is used?** The banner at the top of the page tells you:
- **Offline test model** (default, no setup): completion and polish show canned results, and nothing leaves your machine.
- **Gemini (yellow banner):** live results. Enable it by copying `.env.example` to `.env` and setting `GEMINI_API_KEY`. Text you type in the composers may then be sent to Google, so **use made-up text only**.

Spell checking and auto-correct always run locally, with or without a key.

**Found a problem?** Fill in [`docs/TEST-REPORT-TEMPLATE.md`](docs/TEST-REPORT-TEMPLATE.md) (include the version stamp from the page footer) and send it to whoever shared the prototype with you.

### Troubleshooting

| Problem | Fix |
|---|---|
| "Node 23.6.0 or newer is required" | Install a current Node from https://nodejs.org. |
| "Port 5173 (or 5175) is already in use" | Another program uses it. Find it with `lsof -i :5173` (or `:5175`), stop it, and run `npm run demo` again. |
| Page doesn't load | Use exactly `http://localhost:5173/` (`http://127.0.0.1:5173/` also works) while `npm run demo` is running. |
| Banner says completion and polish are unavailable | The completion server stopped (check the terminal), or `COMPLETION_MODEL=gemini` is set without a key. Spell checking still works. |
| No underlines at all | Use a supported browser; the page shows a notice if yours isn't. |
| Settings got confusing | Press **Reset demo settings** in the settings panel. |

## What the demo contains

- **Two composers:** a chat composer that behaves like Agent Desktop's (Enter sends) and an email composer with formatting.
- **Customer side:** a scripted customer conversation in English or Arabic.
- **Settings panel:** stands in for the administrator and agent settings, with presets ("Spell check only", "Auto-correct", "Everything on").
- **Usage summary:** acceptance rates, latency and revert rate. It records no typed text.

All customer messages, canned responses and knowledge-base articles are **synthetic demo data**.

## For developers

| Script | Purpose |
|---|---|
| `npm run demo` | Demo page (:5173) and completion server (:5175) together, for testers |
| `npm run dev` | Demo page only (Vite, :5173); the completion API is proxied as `/api` |
| `npm run server` | Completion, polish and telemetry server (:5175). Environment: `GEMINI_API_KEY`, `COMPLETION_MODEL=auto\|gemini\|fake`, `PORT` |
| `npm test` | Unit tests (Vitest; test files run one at a time, see `docs/known-issues.md` KI-1) |
| `npm run typecheck` | Type checking |
| `npm run build` | Production build of the demo page to `dist/` |
| `npm run fetch-dicts` | Provision both dictionaries into `public/dicts/` (offline) |
| `npm run build:wasm` | Recompile Hunspell to WASM in Docker (pinned tag and toolchain) |
| `npm run ad-loader` | Dev-only loader for trying the layer on a live Agent Desktop tenant (not for testers) |

**Architecture:**
- **Spelling (Tier 1):** Hunspell compiled to WebAssembly runs in a Web Worker, with no network calls. Underlines use the CSS Custom Highlight API and are never written into the editor's DOM.
- **Completion and polish (Tier 2):** server-side. The dev server (`server/`) stands in for the Intelligence Engine and calls Gemini.

`CLAUDE.md` describes the layout and constraints. Requirements and the architecture draft are in `docs/`. Work is planned and tracked with OpenSpec under `openspec/`.

## Licensing and terms

- **Hunspell** (v1.7.4) is compiled to WASM and used under its **MPL 1.1** option. See `src/spell/wasm/NOTICE` and `PROVENANCE.json`.
- **English dictionary:** `dictionary-en` (SCOWL-derived), MIT AND BSD.
- **Arabic dictionary** (AyaSpell): tri-licensed GPL-2+ / LGPL-2.1+ / MPL-1.1; this project elects **MPL 1.1**. It's vendored unmodified in `dicts/ar/` with a `NOTICE`, and its hashes are pinned. See `dicts/MANIFEST.md`.
- **Gemini API** (optional, dev completion and polish only): Google APIs Terms of Service and Gemini API Additional Terms. It's not shipped.
