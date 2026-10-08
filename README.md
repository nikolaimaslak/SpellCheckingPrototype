# Composer assistance prototype

Prototype of writing help for Bright Pattern Agent Desktop's chat and email composers, in **Arabic and English**:
- **Spell checking and auto-correct** (PER #60254), entirely in the browser.
- **Smart Compose-style inline completion**, grounded in the conversation, canned responses and a knowledge base (PER #60145).
- An on-demand **grammar polish** button (PER #60254).

## Quick start (testers)

You need **Node.js 23.6 or newer** (`node --version`), **uv** (`uv --version`; it runs the completion server and installs the right Python by itself) and a current **Chrome or Edge** (Safari 17.2+ and Firefox 140+ also work).

Install uv once with `curl -LsSf https://astral.sh/uv/install.sh | sh` (macOS: `brew install uv`; Windows: `winget install astral-sh.uv`).

```sh
npm install
npm run demo
```

Then open **http://localhost:5173/** and follow the **[tester guide](docs/TESTING.md)**: scenarios, what to type, and what you should see. Stop the demo with **Ctrl+C**.

**Which model is used?** The banner at the top of the page tells you:
- **Offline test model** (default, no setup): completion and polish show canned results, and nothing leaves your machine.
- **Gemini (yellow banner):** live results. Enable it by copying `.env.example` to `.env` and setting `GEMINI_API_KEY`. Text you type in the composers may then be sent to Google, so **use made-up text only**.
- **A local model** (for example `COMPLETION_MODEL=ollama_chat/<model>` in `.env`): live results from a model on your machine; the banner says nothing leaves it. Any other remote model gets the yellow warning too.

Spell checking and auto-correct always run locally, with or without a key.

**Found a problem?** Fill in [`docs/TEST-REPORT-TEMPLATE.md`](docs/TEST-REPORT-TEMPLATE.md) (include the version stamp from the page footer) and send it to whoever shared the prototype with you.

### Troubleshooting

| Problem | Fix |
|---|---|
| "Node 23.6.0 or newer is required" | Install a current Node from https://nodejs.org. |
| "uv is required to run the completion server" | Install uv (command above), open a new terminal, and run `npm run demo` again. |
| "Could not prepare the Python environment" | Check your network for the first run (uv downloads Python and the server's packages once), then run `npm run demo` again. |
| "Port 5173 (or 5175) is already in use" | Another program uses it. Find it with `lsof -i :5173` (or `:5175`), stop it, and run `npm run demo` again. |
| Page doesn't load | Use exactly `http://localhost:5173/` (`http://127.0.0.1:5173/` also works) while `npm run demo` is running. |
| Banner says completion and polish are unavailable | The completion server stopped (check the terminal), or `COMPLETION_MODEL=gemini` is set without a key. Spell checking still works. |
| No underlines at all | Use a supported browser; the page shows a notice if yours isn't. |
| Settings got confusing | Press **Reset demo settings** in the settings panel. |

## What the demo contains

- **Two composers:** a chat composer that behaves like Agent Desktop's (Enter sends) and an email composer with formatting.
- **Customer side:** a scripted customer conversation in English or Arabic, or your own: **Load conversation…** (under the chat) takes pasted text or a file with `Customer:` / `Agent:` turns and loads it up to the agent message you choose, with canned responses turned off. See the [tester guide](docs/TESTING.md) T4b.
- **Settings panel:** stands in for the administrator and agent settings, with presets ("Spell check only", "Auto-correct", "Everything on").
- **Usage summary:** acceptance rates, latency and revert rate. It records no typed text.

All customer messages, canned responses and knowledge-base articles are **synthetic demo data**.

## For developers

| Script | Purpose |
|---|---|
| `npm run demo` | Demo page (:5173) and completion server (:5175) together, for testers |
| `npm run dev` | Demo page only (Vite, :5173); the completion API is proxied as `/api` |
| `uv run --project server python -m assist` | Completion, polish and telemetry server (:5175), Python with DSPy and FastAPI (`npm run server` is an alias). Environment: `GEMINI_API_KEY`, `COMPLETION_MODEL=auto\|gemini\|fake\|<provider>/<model>`, `COMPLETION_API_BASE`, `COMPLETION_MAX_TURNS`, `ASSIST_LLM_CACHE`, `PORT` (see `.env.example`) |
| `npm test` | Unit tests: Vitest (test files run one at a time, see `docs/known-issues.md` KI-1), then the server's pytest suite (`npm run test:py`) |
| `npm run typecheck` | Type checking |
| `npm run build` | Production build of the demo page to `dist/` |
| `npm run fetch-dicts` | Provision both dictionaries into `public/dicts/` (offline) |
| `npm run build:wasm` | Recompile Hunspell to WASM in Docker (pinned tag and toolchain) |
| `npm run eval` / `eval:check` | Spelling benchmark on synthetic datasets, and its gate (see `docs/EVALUATION.md`) |
| `npm run eval:completion:build -- <file> --name <set>` | Build a local completion test set from chat or plain text (gitignored `eval/local/completion/`) |
| `npm run eval:completion -- --set <set>` | Run it through the completion program and write a report (see `docs/COMPLETION-EVAL.md`) |
| `npm run ad-loader` | Dev-only loader for trying the layer on a live Agent Desktop tenant (not for testers) |

**Architecture:** see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. In short:
- **Spelling (Tier 1):** Hunspell compiled to WebAssembly runs in a Web Worker, with no network calls. Underlines use the CSS Custom Highlight API and are never written into the editor's DOM.
- **Completion and polish (Tier 2):** the dev server (`server/`, Python) stands in for the Intelligence Engine. FastAPI handles requests, and every model call goes through a typed DSPy program, so the model (Gemini in dev, a local model in production) is chosen by configuration. The model returns just the text that continues the agent's sentence.

`CLAUDE.md` describes the layout and constraints. Requirements and the original architecture draft are in `docs/`. Work is planned and tracked with OpenSpec under `openspec/`.

## Licensing and terms

- **Hunspell** (v1.7.4) is compiled to WASM and used under its **MPL 1.1** option. See `src/spell/wasm/NOTICE` and `PROVENANCE.json`.
- **English dictionary:** `dictionary-en` (SCOWL-derived), MIT AND BSD.
- **Arabic dictionary** (AyaSpell): tri-licensed GPL-2+ / LGPL-2.1+ / MPL-1.1; this project elects **MPL 1.1**. It's vendored unmodified in `dicts/ar/` with a `NOTICE`, and its hashes are pinned. See `dicts/MANIFEST.md`.
- **Gemini API** (optional, dev completion and polish only): Google APIs Terms of Service and Gemini API Additional Terms. It's not shipped.
- **Server (Python, dev only):** DSPy and LiteLLM (MIT), FastAPI and pydantic (MIT), uvicorn and Starlette (BSD-3-Clause), regex (Apache-2.0 AND CNRI-Python), json-repair (MIT); the full locked set has no GPL/LGPL terms (audit in `openspec/changes/archive/*dspy-assist-service/license-audit.md`).
