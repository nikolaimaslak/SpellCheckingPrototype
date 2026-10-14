# Composer assistance prototype

A demo page for the algorithms behind writing help in Bright Pattern Agent Desktop's message composer, in **Arabic and English**:
- **Spell checking and auto-correct** (PER #60254), entirely in the browser.
- **Smart Compose-style inline completion**, grounded in the conversation, canned responses and a knowledge base (PER #60145).
- An on-demand **grammar polish** button (PER #60254).

## Quick start (testers)

You need **Node.js 23.6 or newer** (`node --version`) and a current **Chrome or Edge** (Safari 17.2+ and Firefox 140+ also work).

```sh
npm install
npm run dev
```

Then open **http://localhost:5173/** and follow the **[tester guide](docs/TESTING.md)**: scenarios, what to type, and what you should see. Stop it with **Ctrl+C**.

**Completion and Polish** need an **OpenAI API key**: type it in the settings panel (it is saved in this browser). The page then calls OpenAI (`gpt-4.1-mini`) directly, and the line under the title says so. Text you type in the message field, the conversation, canned responses and KB are sent to OpenAI, so **use made-up text only**.

Spell checking and auto-correct always run locally, with or without a key.

**Found a problem?** Fill in [`docs/TEST-REPORT-TEMPLATE.md`](docs/TEST-REPORT-TEMPLATE.md) (include `git rev-parse --short HEAD`) and send it to whoever shared the prototype with you.

### Troubleshooting

| Problem | Fix |
|---|---|
| "Node 23.6.0 or newer is required" | Install a current Node from https://nodejs.org. |
| "Port 5173 is already in use" | Another program uses it. Find it with `lsof -i :5173`, stop it, and run `npm run dev` again. |
| Page doesn't load | Use exactly `http://localhost:5173/` (`http://127.0.0.1:5173/` also works) while `npm run dev` is running. |
| No grey suggestion, or Polish says it is unavailable | No OpenAI API key, or a wrong one. The event log shows `"reply":null`. Spell checking still works. |
| No underlines at all | Use a supported browser (one with the CSS Custom Highlight API, listed above). |
| Settings got confusing | Press **Reset** in the settings panel. |

## What the demo contains

- **One message field:** Enter adds the message to the Conversation as the agent, Shift+Enter breaks the line. Spelling underlines, the suggestions popover (click a word or Ctrl+.), auto-correct, the grey completion (Tab accepts) and the **Polish** button all work on it. Ctrl/Cmd+Z undoes any automatic change.
- **Settings:** spell check, auto-correct and when it applies, languages, custom dictionary, completion on or off, the OpenAI API key, and the sources as plain text: **Conversation** (`Customer:` / `Agent:` lines, with a scenario button that adds the next customer message), **Canned responses** and **Knowledge base**. Saved in the browser; **Reset** goes back to the defaults.
- **Events:** every event (underlined word, auto-correction, completion request and reply, polish) as one JSON line, at the bottom of the page.

All customer messages, canned responses and knowledge-base articles are **synthetic demo data**.

## For developers

| Script | Purpose |
|---|---|
| `npm run dev` | The demo page (Vite, :5173) |
| `npm test` | Unit tests: Vitest (test files run one at a time, see `docs/known-issues.md` KI-1) |
| `npm run typecheck` | Type checking |
| `npm run build` | Production build of the demo page to `dist/` |
| `npm run fetch-dicts` | Provision both dictionaries into `public/dicts/` (offline) |
| `npm run build:wasm` | Recompile Hunspell to WASM in Docker (pinned tag and toolchain) |
| `npm run eval` / `eval:check` | Spelling benchmark on synthetic datasets, and its gate (see `docs/EVALUATION.md`) |

**Architecture:** see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. In short:
- **The page:** React + Tailwind (`src/app/`) draws the state of `createAssistant` (`src/assistant/`), which handles the message field's events. The algorithms are plain TypeScript in `src/autocorrect/`, `src/tokenizer/` and `src/spell/`.
- **Spelling (Tier 1):** Hunspell compiled to WebAssembly runs in a Web Worker, with no network calls. Underlines use the CSS Custom Highlight API and are never written into the field's DOM.
- **Completion and polish:** `src/assistant/server.ts` calls the OpenAI chat API from the page with the key from the settings. The model returns just the text that continues the agent's sentence, or the fixed draft.

`CLAUDE.md` describes the layout and constraints. Requirements and the original architecture draft are in `docs/`. Work is planned and tracked with OpenSpec under `openspec/`.

## Licensing and terms

- **Hunspell** (v1.7.4) is compiled to WASM and used under its **MPL 1.1** option. See `src/spell/wasm/NOTICE` and `PROVENANCE.json`.
- **English dictionary:** `dictionary-en` (SCOWL-derived), MIT AND BSD.
- **Arabic dictionary** (AyaSpell): tri-licensed GPL-2+ / LGPL-2.1+ / MPL-1.1; this project elects **MPL 1.1**. It's vendored unmodified in `dicts/ar/` with a `NOTICE`, and its hashes are pinned. See `dicts/MANIFEST.md`.
- **OpenAI API** (optional, completion and polish only): OpenAI terms of use. It's not shipped.
