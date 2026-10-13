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
- `docs/REMOTE-OLLAMA.md`: running completion and polish on Ollama on a remote GPU (SSH tunnel so it stays local, Ollama settings, model choice for 12 GB, comparing against Gemini)
- `docs/EVALUATION.md`: how spelling quality is measured (criteria, datasets, error types, field metrics)
- `docs/TESTING.md`: the external tester guide. Keep its scenarios and expected results in sync with behavior changes. Report template: `docs/TEST-REPORT-TEMPLATE.md`, mirrored in `.github/ISSUE_TEMPLATE/`

## Workflow

All work goes through OpenSpec changes: `/opsx:propose <name>` → review → `/opsx:apply` → `/opsx:archive`. Don't implement outside a change. Current specs are in `openspec/specs/`, and in-flight changes are in `openspec/changes/`.

## Commands

| Command | What it does |
|---|---|
| `npm run demo` | Testers' one-command start (needs Node and `uv`): checks Node, `uv` and ports, provisions dictionaries, runs `uv sync`, starts the demo page (:5173) and the Python completion server (:5175), prints the URL and active model |
| `npm run dev` | Demo page only, at http://localhost:5173 (bound to 127.0.0.1; provisions dictionaries first) |
| `npm test` | Vitest (Node by default; DOM tests opt in with `// @vitest-environment jsdom`), then pytest for the server (`npm run test:py`) |
| `npm run test:py` | The server's pytest suite only: `uv run --project server --locked pytest server/tests -q` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck + production build to `dist/` (both dictionaries) |
| `npm run fetch-dicts` | Provision English (from npm) and Arabic (vendored `dicts/ar`, sha256-checked) into `public/dicts/`, offline |
| `npm run build:wasm` | Rebuild Hunspell WASM in Docker; only when changing the pin or `wasm/binding.cpp` |
| `uv run --project server python -m assist` | The completion, polish and telemetry server on 127.0.0.1:5175 (`npm run server` is an alias). `COMPLETION_MODEL=auto` (default: Gemini with `GEMINI_API_KEY`, else the offline test model), `gemini`, `fake`, or any LiteLLM id such as `ollama_chat/<model>` (with `COMPLETION_API_BASE`). `COMPLETION_MAX_TURNS` limits the conversation sent (default: all of it); `ASSIST_LLM_CACHE=on` caches LLM requests under `.cache/llm/` (default off). The demo reaches it via the Vite `/api` proxy |
| `npm run eval` | Spelling benchmark (offline, a few minutes): detection, correction, auto-replace, error types; writes `eval/reports/latest.md`. `eval:check` gates against `eval/baseline.json`, `eval:baseline` rewrites it. See `docs/EVALUATION.md` |
| `npm run eval:inject` / `eval:words` / `eval:build` / `eval:manifest` | Insert typed misspellings, build word lists, compile hand-marked dataset sources, re-hash the dataset manifest |
| `npm run eval:qalb -- <areta-file> --name <set> --source … --license … --license-file <path>` | Convert a QALB ARETA-tagged alignment file from `../arabic-gec` into a private spelling dataset in `eval/datasets/private/` (gitignored, aggregates only in reports, license copied beside it). Evaluation only: never commit it or build lists from it. See `docs/EVALUATION.md` |
| `npm run eval:completion:build -- <input> --name <set>` | Build a local completion test set from chat text (`Customer:`/`Agent:` turns) or `--plain` text, cut at mid-word, end-of-word, after-space and after-punctuation points, into `eval/local/completion/sets/` (gitignored). Inputs: synthetic, public or redacted only. See `docs/COMPLETION-EVAL.md` |
| `npm run eval:completion -- --set <set>` | Run a set through the real completion program in process (canned responses and KB off, cache off; `--samples`, `--concurrency`); writes `report.md` / `.json` with shown, withheld, word completion and spacing errors under `eval/local/completion/runs/` |
| `npm run telemetry:spelling` | Spelling error report from `telemetry/events.jsonl`: every flagged, accepted, left-misspelled (`unresolved`), ignored, auto-corrected and reverted word per language, with candidates for the custom dictionary (words left misspelled), the misspellings lists and removal (human review only). Writes `telemetry/spelling-report.md` / `.json`; `/summary` shows the candidates. Flagged words can be names: the log stays local |
| `npm run capture:report` | Report on the opt-in LLM capture log (`ASSIST_CAPTURE=errors` or `all`): counts per issue reason (failures such as `format`, `wrong-script`, `protected-changed`; repairs such as `rewrote-word`, `multi-sentence`) with examples of input, raw answer and shown text. Writes `capture/report.md` |
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
- `server/`: Tier 2 dev stand-in, in Python (`uv` project: `pyproject.toml`, `uv.lock`, `.python-version`). The `assist` package: `app.py` (FastAPI routes and error shape), `settings.py` (env, `.env`, model selection), `programs.py` (the typed DSPy programs `ContinueText` / `PolishDraft`, the `TypedJSONAdapter`, the offline test model), `lm.py` (the `dspy.LM` through LiteLLM, cache, error classes), `complete.py` / `polish.py` (the endpoints), `retrieval.py` (over the synthetic `server/data/canned.json` and `server/data/kb.json`), `postprocess.py` (joining the continuation, `finalize`, the derived edit), `telemetry.py` + `error_types.py` (event log and `/summary`). Tests in `server/tests/` (pytest), including `test_scenarios_en.py`, which runs every English spec scenario and fails on an untested one. It doesn't import `src/`.
- `eval/completion/`: the older hand-written case dataset (`cases.jsonl`, loader `cases.ts`, unused by the local eval), the last live run on the former Node server (`reference/`), and `examples/chat-example.txt` (the eval's input format).
- `server/assist_eval/`: the local completion eval (`sources.py` parsing, `cases.py` cutting, `run.py`, `metrics.py`, `report.py`, CLI in `__main__.py`); tests in `server/tests/eval/`. Its workspace `eval/local/completion/` is gitignored. There is no completion gate: after a change to completion assembly or its prompt, run `npm test` and compare an `npm run eval:completion` report with the previous one.
- `eval/`: spelling evaluation tooling, run by Node through `eval/register.ts` (resolves `src/`'s extensionless imports). `pipeline.ts` mirrors the composer in typing order; `error-types.ts` is the error taxonomy and classifier (the server's `error_types.py` is a Python port of `classify`; `test/fixtures/error-types.json` is checked against both); `datasets/` holds the manifest-checked synthetic datasets (`private/` is gitignored); `criteria.json` and `baseline.json` drive the gate. Run `npm run eval:check` before and after any change to auto-correct.
- `dev/ad-loader/`: dev-only loader for a live Agent Desktop tenant; never part of the build.
- `wasm/`: `build.sh` (pinned Hunspell tag and emsdk digest) and `binding.cpp` (6-function C ABI).
- `scripts/fetch-dicts.ts`: dictionary provisioning (run directly by Node, no build step).
- `dicts/`: vendored Arabic dictionary (`ar/` with `NOTICE`) and `MANIFEST.md` (sources, pins, hashes, licenses).
- `test/`: mirrors `src/`, `scripts/` and `eval/`; `test/fixtures/` holds fixtures shared with the server's pytest suite. Test files run serially (`fileParallelism: false`; see KI-1).

## Hard constraints

- **No browser extensions.** Everything is page code.
- **Tier 1 never touches the network.** Only same-origin static assets (WASM, dictionaries). Engine work stays in the worker, never on the page thread. Completion (Tier 2) is the exception, and only to our own service.
- **Secrets stay server-side.** `GEMINI_API_KEY` only in the server environment or gitignored `.env`. Hosted-model traffic is for synthetic demo data only. Telemetry never stores completion, transcript or composer text (server allowlist). The LLM request cache stores prompts, so it is **off by default** (`ASSIST_LLM_CACHE`); DSPy history and LiteLLM debug output stay off. The LLM capture log (`ASSIST_CAPTURE`, `capture/`, gitignored) stores request and answer text: off by default, synthetic or redacted text only. Text-free `llm-request` / `llm-issue` counters are always written to telemetry.
- **Never write decorations into the editable DOM.** Use the CSS Custom Highlight API for underlines and an overlay for ghost text. Programmatic text changes go through one transaction path so a single undo reverts them.
- **Licensing.** No GPL/LGPL terms. Hunspell and the AyaSpell Arabic dictionary are both tri-licensed and used under **MPL 1.1** (notices in `src/spell/wasm/NOTICE` and `dicts/ar/NOTICE`). Any new dependency needs its license checked first.
- **English is the first language.** Delivery priority: every test and spec scenario must work in English, and every text-processing behavior has English cases.
- **Arabic is first-class.** Give every text-processing behavior Arabic and mixed Arabic/English test cases. Use `dir="auto"` / `unicode-bidi: plaintext` for direction.
- Exclude URLs, emails, reference numbers, tokens with digits, and `$(substitution.fields)` from checking.

## Conventions

- TypeScript strict with `erasableSyntaxOnly` (no enums, no parameter properties), so `scripts/*.ts` run directly under Node.
- Vanilla DOM, no UI framework, npm for the page and tooling.
- The server is Python under `uv` (pinned Python, locked dependencies). Every LLM call goes through a typed DSPy program with `TypedJSONAdapter` (never `ChatAdapter`), with no retries; post-processing (assembly, withheld checks, polish safety checks) stays deterministic code, never in the model.
- Tests read dictionaries from `node_modules/dictionary-en/` and `dicts/ar/` directly.
