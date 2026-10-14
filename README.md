# Composer assistance prototype

A demo page for the algorithms behind writing help in Bright Pattern Agent Desktop's message composer, in **Arabic and English**:
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

**Which model is used?** `npm run demo` prints it in the terminal, and every `complete-reply` / `polish-reply` in the page's event log names it (`model`):
- **Offline test model** (default, no setup): completion and polish show canned results, and nothing leaves your machine.
- **Gemini:** live results. Enable it by copying `.env.example` to `.env` and setting `GEMINI_API_KEY`. Text you type in the message field may then be sent to Google, so **use made-up text only**.
- **A local model** (for example `COMPLETION_MODEL=ollama_chat/<model>` in `.env`): live results from a model on your machine. Any other remote model gets text you type too. For Ollama on another machine's GPU (through an SSH tunnel), see [`docs/REMOTE-OLLAMA.md`](docs/REMOTE-OLLAMA.md).

Spell checking and auto-correct always run locally, with or without a key.

**Found a problem?** Fill in [`docs/TEST-REPORT-TEMPLATE.md`](docs/TEST-REPORT-TEMPLATE.md) (include `git rev-parse --short HEAD`) and send it to whoever shared the prototype with you.

### Troubleshooting

| Problem | Fix |
|---|---|
| "Node 23.6.0 or newer is required" | Install a current Node from https://nodejs.org. |
| "uv is required to run the completion server" | Install uv (command above), open a new terminal, and run `npm run demo` again. |
| "Could not prepare the Python environment" | Check your network for the first run (uv downloads Python and the server's packages once), then run `npm run demo` again. |
| "Port 5173 (or 5175) is already in use" | Another program uses it. Find it with `lsof -i :5173` (or `:5175`), stop it, and run `npm run demo` again. |
| Page doesn't load | Use exactly `http://localhost:5173/` (`http://127.0.0.1:5173/` also works) while `npm run demo` is running. |
| No grey suggestion, or Polish says it is unavailable | The completion server stopped (check the terminal), or `COMPLETION_MODEL=gemini` is set without a key. The event log shows `"reply":null`. Spell checking still works. |
| No underlines at all | Use a supported browser (one with the CSS Custom Highlight API, listed above). |
| Settings got confusing | Press **Reset** in the settings panel. |

## What the demo contains

- **One message field:** Enter adds the message to the Conversation as the agent, Shift+Enter breaks the line. Spelling underlines, the suggestions popover (click a word or Ctrl+.), auto-correct, the grey completion (Tab accepts) and the **Polish** button all work on it. Ctrl/Cmd+Z undoes any automatic change.
- **Settings:** spell check, auto-correct and its confidence, languages, custom dictionary, completion on or off, and the sources as plain text: **Conversation** (`Customer:` / `Agent:` lines, with a scenario button that adds the next customer message), **Canned responses** and **Knowledge base**. Saved in the browser; **Reset** goes back to the defaults.
- **Events:** every event (underlined word, auto-correction, completion request and reply, polish) as one JSON line, at the bottom of the page.

All customer messages, canned responses and knowledge-base articles are **synthetic demo data**.

## For developers

| Script | Purpose |
|---|---|
| `npm run demo` | Demo page (:5173) and completion server (:5175) together, for testers |
| `npm run dev` | Demo page only (Vite, :5173); the completion API is proxied as `/api` |
| `uv run --project server python -m assist` | Completion and polish server (:5175), Python with DSPy and FastAPI (`npm run server` is an alias). Environment: `GEMINI_API_KEY`, `COMPLETION_MODEL=auto\|gemini\|fake\|<provider>/<model>`, `COMPLETION_API_BASE`, `COMPLETION_MAX_TURNS`, `ASSIST_LLM_CACHE`, `PORT` (see `.env.example`) |
| `npm test` | Unit tests: Vitest (test files run one at a time, see `docs/known-issues.md` KI-1), then the server's pytest suite (`npm run test:py`) |
| `npm run typecheck` | Type checking |
| `npm run build` | Production build of the demo page to `dist/` |
| `npm run fetch-dicts` | Provision both dictionaries into `public/dicts/` (offline) |
| `npm run build:wasm` | Recompile Hunspell to WASM in Docker (pinned tag and toolchain) |
| `npm run eval` / `eval:check` | Spelling benchmark on synthetic datasets, and its gate (see `docs/EVALUATION.md`) |
| `npm run eval:completion:build -- <file> --name <set>` | Build a local completion test set from chat or plain text (gitignored `eval/local/completion/`) |
| `npm run eval:completion -- --set <set>` | Run it through the completion program and write a report (see `docs/COMPLETION-EVAL.md`) |

**Architecture:** see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. In short:
- **The page:** React + Tailwind (`src/app/`) draws the state of `createAssistant` (`src/assistant/`), which handles the message field's events. The algorithms are plain TypeScript in `src/autocorrect/`, `src/tokenizer/` and `src/spell/`.
- **Spelling (Tier 1):** Hunspell compiled to WebAssembly runs in a Web Worker, with no network calls. Underlines use the CSS Custom Highlight API and are never written into the field's DOM.
- **Completion and polish (Tier 2):** the dev server (`server/`, Python) stands in for the Intelligence Engine. FastAPI handles requests, and every model call goes through a typed DSPy program, so the model (Gemini in dev, a local model in production) is chosen by configuration. The model returns just the text that continues the agent's sentence.

`CLAUDE.md` describes the layout and constraints. Requirements and the original architecture draft are in `docs/`. Work is planned and tracked with OpenSpec under `openspec/`.

## Licensing and terms

- **Hunspell** (v1.7.4) is compiled to WASM and used under its **MPL 1.1** option. See `src/spell/wasm/NOTICE` and `PROVENANCE.json`.
- **English dictionary:** `dictionary-en` (SCOWL-derived), MIT AND BSD.
- **Arabic dictionary** (AyaSpell): tri-licensed GPL-2+ / LGPL-2.1+ / MPL-1.1; this project elects **MPL 1.1**. It's vendored unmodified in `dicts/ar/` with a `NOTICE`, and its hashes are pinned. See `dicts/MANIFEST.md`.
- **Gemini API** (optional, dev completion and polish only): Google APIs Terms of Service and Gemini API Additional Terms. It's not shipped.
- **Server (Python, dev only):** DSPy and LiteLLM (MIT), FastAPI and pydantic (MIT), uvicorn and Starlette (BSD-3-Clause), regex (Apache-2.0 AND CNRI-Python), json-repair (MIT); the full locked set has no GPL/LGPL terms (audit in `openspec/changes/archive/*dspy-assist-service/license-audit.md`).
