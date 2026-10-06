# Proposal

## Why

The Tier 2 server talks to the model through hand-built prompt strings and a Gemini-specific REST client:
- `server/prompt.ts` concatenates the instructions and context;
- `server/models/gemini.ts` sends them with Gemini's own request shape;
- `server/models/fake.ts` parses the prompt text back apart.

Moving to the production local LLM would mean rewriting the client and re-tuning the prompt by hand. We want an organized, typed interface to the LLM that doesn't depend on the model: inputs and outputs declared as typed fields, and the model chosen by configuration.

DSPy provides exactly that. Signatures declare typed inputs and outputs, modules run them, and LiteLLM gives it any provider (Gemini, Ollama, vLLM and others) behind one interface. Because DSPy is Python, the server moves to Python, with FastAPI handling the requests.

A typed DSPy program is also the prerequisite for the later optimizer step, which tunes the program on sample data for the model actually used. That step is a separate change.

Serves **PER #60145** (auto-complete, inline completion) and **PER #60254** (grammar polish), **Phase 3–4**. This is mainly infrastructure: the agent-facing behavior and the HTTP contract don't change.

## What Changes

- **BREAKING (dev tooling): the Node server is replaced by a Python server** in `server/`, managed by `uv`:
  - **FastAPI** handles the requests;
  - **DSPy** runs every LLM call;
  - **LiteLLM** (through DSPy) reaches the provider.

  The endpoints, bodies, status codes, port and loopback binding stay the same: `/v1/complete`, `/v1/polish`, `/v1/events`, `/summary` and `/health`. The browser client, the Vite proxy and the demo need no change.
- **Typed programs instead of prompt strings:**
  - **Completion:** a `CompleteSentence` signature, with inputs (approved responses, knowledge base passages, conversation, the agent's text) and outputs (`word`, `rest`).
  - **Polish:** a `PolishDraft` signature, with input `draft` and output `polished`.
  - **Instructions:** carried over unchanged in meaning from today's prompts. The program isn't optimized yet.
- **Deterministic code stays deterministic, ported one-to-one to Python:**
  - retrieval;
  - assembly and the withheld checks;
  - `finalize`;
  - polish's protected-content, length and line-break checks.

  The model is never asked to do their job.
- **Model selection becomes model-independent.** `COMPLETION_MODEL` accepts:
  - `auto`, `gemini` and `fake`, as today;
  - any LiteLLM model id (for example `ollama_chat/<model>`), with an optional `COMPLETION_API_BASE`.

  `/health` reports whether text leaves the machine.
- **Configurable LLM request cache** (DSPy's cache), off by default. It stores prompts, which contain conversation text in production. When it's on, it writes to a gitignored directory.
- **The offline test model** becomes a DSPy LM. It keeps today's deterministic answers, so the demo and the tests run without a key.
- **Telemetry moves to Python** as well: the event log, the allowlist and the `/summary` page. The spelling error-type classifier (`eval/error-types.ts`, still used by the TypeScript spelling eval) gets a Python port. A **shared fixture** of inputs and expected types runs in both Vitest and pytest, so the two copies can't drift.
- **Tests:**
  - The server tests move from Vitest (`test/server/`) to pytest (`server/tests/`) case for case, with the same inputs and expected values. The new behavior in this change (runtime, model selection, cache, error mapping, offline model) gets its own tests.
  - A new suite runs every English and language-neutral scenario of the completion-service, polish-service and assist-service specs, one test per scenario, named after it.
  - `npm test` runs Vitest, then pytest through `uv`.
- **BREAKING (eval): the live completion benchmark and the recorded replays are retired until the completion-eval change.** They run cases in process through the Node server, and their recordings are keyed to today's prompt text.
  - Removed: `eval:completion*`, the runner, the recordings, the replay suite, the metrics, the gate and the report.
  - Kept: the case dataset and its loader.
  - Before deletion, one live run of the current benchmark is committed as a reference report.
- **`npm run demo`** checks that `uv` is installed, runs `uv sync`, and starts the Python server. `.env.example`, `docs/TESTING.md`, `docs/COMPLETION-EVAL.md`, the README and CLAUDE.md are updated.

## Non-goals

- **No prompt optimization** (DSPy optimizers, few-shot demonstrations, training data). That is a separate change.
- **No completion eval in Python.** The new eval will be designed differently, in its own change.
- **No change to what the agent sees, with one exception:** same suggestions, withheld rules, polish checks and client behavior, except that model output is now read leniently in form (JSON inside prose or a fence, cut-off JSON, extra fields), still strictly in type. The fixes discussed for the withheld logic (letter case at the seam, the first-word-only script check, "adds nothing" counted as a format error, prose around the JSON) are not part of this change.
- **No Arabic or mixed-language scenario suite.** This change tests every English (and language-neutral) scenario of the completion-service, polish-service and assist-service specs, because English is the first language. Testing the Arabic and mixed Arabic/English scenarios systematically is a separate change, with its own discussion and review. Until then, Arabic is covered by the ported server tests.
- **No production deployment, packaging or authentication.** The server stays a loopback-only dev stand-in.
- **No change to Tier 1.** Spelling stays fully in the browser, with no network access.

## Capabilities

### New Capabilities
- `assist-service`: the Python Tier 2 runtime shared by completion, polish and telemetry:
  - FastAPI request handling: loopback binding, body limit, error shape, CORS for the dev loader, `.env` loading;
  - typed DSPy programs as the only way to call an LLM;
  - model selection by configuration through LiteLLM, and call settings (timeout, no retries, token limits);
  - the LLM request cache setting;
  - the offline test model.

### Modified Capabilities
- `completion-service`:
  - **Model call** now runs the typed `CompleteSentence` program, selected and configured by `assist-service`, instead of a Gemini-specific JSON request.
  - **Context assembly:** context is passed as typed input fields, stable ones first, instead of a concatenated prompt string.
- `polish-service`: **Minimal-correction instructions** run as the typed `PolishDraft` program, with the corrected text as a typed output field. The safety checks are unchanged.
- `assist-telemetry`: **Summary page:** the error-type classification is a Python port of the shared taxonomy, kept equal to the TypeScript one by a shared fixture.
- `completion-eval`:
  - The case dataset requirement stays.
  - Removed until the completion-eval change: recorded replays, live benchmark run, metrics, criteria and gate, and report.
- `tester-kit`:
  - **One-command start** also checks for `uv` and syncs the Python environment.
  - **Environment template** documents the new model and cache settings.
  - **Tester guide** requirements add `uv`.

## Impact

- **Code removed:** `server/*.ts`, `server/models/`, `test/server/`, and in `eval/completion/` the runner, recordings, judges, metrics, gate, criteria, baseline and report code. Also `eval/cli/completion.ts` and the `test/eval/completion-*` suites, except the case loader and its test.
- **Code added:**
  - in `server/`: `pyproject.toml`, `uv.lock`, `.python-version`, the `assist` Python package and `tests/`;
  - a shared error-type fixture under `test/fixtures/`.
- **Data kept as is:** `server/data/` (canned responses, knowledge base).
- **Scripts:**
  - the server's own command is `uv run --project server python -m assist`, documented as the way to run it. `npm run server` stays only as a convenience alias, and `npm run demo` remains the testers' single entry point (it starts the page and the server);
  - `npm test` adds pytest;
  - `npm run demo` checks for `uv` and syncs;
  - the `eval:completion*` scripts are removed.
- **Unchanged:** `src/` except the demo page's model banner (`src/demo/model-banner.ts`, which learns local and non-Google external models; added during implementation), `vite.config.ts` (it still proxies `/api` to 127.0.0.1:5175), and `dev/ad-loader`.
- **Developer and tester requirement:** `uv` must be installed. It downloads the pinned Python itself, so no system Python is needed.
- **New dependencies** (licenses checked on PyPI; all permissive, no GPL/LGPL):

  | Package | Version | License | Use |
  |---|---|---|---|
  | `dspy` | 3.4.x | MIT | typed LLM programs, cache |
  | `litellm` | 1.x (via dspy) | MIT, core only; its separately licensed `enterprise/` code isn't used | provider access |
  | `fastapi` | 0.14x | MIT | request handling |
  | `starlette` | via fastapi | BSD-3-Clause | ASGI toolkit |
  | `uvicorn` | 0.5x | BSD-3-Clause | ASGI server |
  | `pydantic` | 2.x | MIT | typed request and reply models |
  | `regex` | 2026.x (already pulled in by LiteLLM) | Apache-2.0 AND CNRI-Python | Unicode property classes (`\p{L}`, `\p{Script=Arabic}`) for the ported text rules |
  | `pytest`, `httpx` | dev only | MIT, BSD-3-Clause | tests and the in-process test client |

  The full transitive set is audited for GPL/LGPL terms before the lockfile is committed.
- **Data handling:** the same as today.
  - Hosted-model traffic is for synthetic text only.
  - The key stays in the server environment.
  - Telemetry stores no text.
  - The new LLM cache is off by default, and its directory is gitignored.
