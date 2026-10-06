# Tasks

## 1. Reference and scaffolding

- [x] 1.1 Before anything changes, run `npm run eval:completion` with Gemini on the current Node server. Commit the report as `eval/completion/reference/node-server.md` and `.json`, with a header naming the commit, model and date (design 10). Verify that the file holds every criterion's value and the per-language metrics. If no key is available, stop and ask the user rather than skip.
- [x] 1.2 Create the Python project in `server/`: `pyproject.toml` (package `assist`; dependencies `dspy`, `fastapi`, `uvicorn`, `pydantic`, `regex`; dev dependencies `pytest`, `httpx`), `.python-version` (3.13) and `uv.lock`. Add an empty `assist/__init__.py` and `tests/test_smoke.py`. Verify with `uv sync --project server --locked` and `uv run --project server pytest server/tests -q`, which passes 1 test.
- [x] 1.3 Audit the licenses of the whole locked set: list every installed package with its license metadata, and record the summary in the change, with any package that needs a manual look. Verify that nothing is GPL or LGPL. If anything is, stop and raise it before continuing.
- [x] 1.4 Add `.cache/`, `server/.venv/`, `__pycache__/` and `.pytest_cache/` to `.gitignore`. Verify with `git status`: it stays clean after `uv sync` and a pytest run.

## 2. Deterministic ports (Tier 2)

- [x] 2.1 Port `server/retrieval.ts` to `assist/retrieval.py` (normalize, tokens, stemming, `rank`, `retrieve`, `kb_passages`, `retrieve_kb`, the thresholds; design 7). Verify with `server/tests/test_retrieval.py` and `test_kb.py`, which repeat every case of `test/server/retrieval.test.ts` and `kb.test.ts` with the same expected ids and order. This includes the Arabic hamza retrieval, the strong and weak KB matches, and the mixed Arabic and English queries.
- [x] 2.2 Port `server/postprocess.ts` and `scriptOf` to `assist/postprocess.py` (`parse_structured`, `assemble`, `finalize`, `script_of`, the terminator and identifier rules). Verify with `server/tests/test_postprocess.py`, which repeats every case of `test/server/postprocess.test.ts`, plus one emoji-prefix case that documents the code-point offsets.
- [x] 2.3 Write `test/fixtures/error-types.json` from the cases in `test/eval/error-types.test.ts` and the telemetry spec's examples (design 8). Add a Vitest block in `test/eval/error-types.test.ts` that runs the fixture through `classify`. Verify that `npm test` passes and that editing one expected type makes it fail.
- [x] 2.4 Port `classify` and its helpers from `eval/error-types.ts` to `assist/error_types.py`. Verify with `server/tests/test_error_types.py`, which runs the same fixture: every English, Arabic, `multi`, `boundary` and mixed-script entry matches.
- [x] 2.5 Port `server/telemetry.ts` to `assist/telemetry.py` (`sanitize` allowlist, append and read, `summarize`, `spelling_by_lang`, `render_summary` with the same labels). Verify with `server/tests/test_telemetry.py`, which repeats `test/server/telemetry.test.ts` case for case, plus reading a log line written by the Node server.

## 3. Model interface (Tier 2, config)

- [x] 3.1 Write `assist/settings.py`: the `.env` loader (environment wins), `PORT`, `ASSIST_LLM_CACHE`, `COMPLETION_MAX_TURNS` (unset or invalid means the full conversation, invalid with a warning), and model selection for `auto`, `gemini`, `fake`, `<provider>/<model>` and `COMPLETION_API_BASE`, with the external rule and the unknown-value warning (design 4). Verify with `server/tests/test_settings.py`, which covers every assist-service model-selection scenario and the "environment wins over .env" scenario.
- [x] 3.2 Write `assist/programs.py`:
  - the `CompleteSentence` and `PolishDraft` signatures, with today's instructions reworded to name the fields;
  - the two modules, both always using `JSONAdapter` (never `ChatAdapter`, for any model), through a subclass whose parse is lenient in form and strict in type (design 3);
  - the full conversation by default, or the last `COMPLETION_MAX_TURNS` turns when set (design 3).

  Verify with `server/tests/test_programs.py`:
  - 12 turns all reach the model without `COMPLETION_MAX_TURNS`, and only the last 6 with it set to 6;
  - the input fields are in stable-first order;
  - the instructions contain the required rules (no ban on details, details only from the sources, whole `word` and `rest`, no fragments, same language);
  - the polish instructions keep placeholders, links and numbers;
  - parsing: JSON inside prose or a fence, cut-off JSON and extra fields are read; a number, null, list or object in `word`, `rest` or `polished` is an error.
- [x] 3.3 Write the offline fake predictors (`FakeCompletePredict`, `FakePolishPredict`), ported from `server/models/fake.ts`, which read the typed fields (design 5). Verify with `server/tests/test_fake.py`, which repeats `test/server/fake.test.ts` and the assist-service scenarios for English completion, Arabic completion and mixed-language polish.
- [x] 3.4 Write `assist/lm.py` (design 4 and 6):
  - building the LM (temperature, `num_retries=0`, token limits, timeouts, `reasoning_effort` with `drop_params`, `api_base`);
  - the cache setup (off by default, `.cache/llm/` when on);
  - history, debug and telemetry turned off;
  - `classify_error`.

  Add a scripted test double under `server/tests/` (implemented at the LiteLLM call, see design 5). Verify with `server/tests/test_lm.py`:
  - with the cache off, two identical calls both reach the scripted LM, and nothing is written under `.cache/`;
  - with it on, the second call is served from the cache in a temporary cache directory;
  - after a call, the LM history is empty;
  - a timeout maps to 504, a parse failure to format, and any other error to 502 with a fixed reason;
  - both programs run through `JSONAdapter` (assert the adapter in use), and every request makes exactly one model call: a failed structured-output request isn't retried in plain JSON mode, and the reply is `withheld: "format"` (completion) or the unchanged draft (polish);
  - the outgoing request (inspected through the scripted LM or LiteLLM's mock) carries the token limit, no retries, and `response_format` when the model supports a schema.
- [x] 3.5 Check the Gemini request settings: with a fake HTTP transport (no network), assert that a `gemini/gemini-3.5-flash-lite` call sends `temperature` 0.2, the output limit, the JSON schema for `word` and `rest`, and minimal thinking. Verify in `server/tests/test_gemini_request.py`. If `reasoning_effort` doesn't map to minimal thinking, pass Gemini's thinking setting explicitly for the `gemini/` provider, and record that in design.md.

## 4. Endpoints and app (Tier 2)

- [x] 4.1 Write `assist/app.py` `create_app(settings, lm)`. It needs:
  - raw-body reading (64 KiB cap, invalid JSON gives 400 "bad request");
  - the 404 fallback;
  - handlers for validation errors and uncaught exceptions that return `{ error }` (never 422, and no exception text);
  - the CORS, private-network and `no-store` middleware with `OPTIONS` answering 204;
  - `GET /health` returning `{ ok, model, mode, external, cache }`.

  Verify with `server/tests/test_app.py` through `TestClient`. It covers every assist-service runtime scenario: invalid JSON, the 100 KiB body, `{ "prefix": 42 }` giving 400, the preflight headers, and 404.
- [x] 4.2 Write `assist/complete.py` for `POST /v1/complete`: lenient parsing with the same messages and caps, retrieval, the program under `asyncio.wait_for(2s)`, assemble and finalize, `sources`, `latencyMs`, `withheld` with a `completion-withheld` telemetry event (reason and language only), and the 503, 502 and 504 errors. Verify with `server/tests/test_complete.py`, which repeats `test/server/complete.test.ts` with the scripted LM and the fake.
- [x] 4.3 Write `assist/polish.py` for `POST /v1/polish`: `{ text }` validation (empty or over 4000 characters gives 400), the program under `wait_for(4s)` with the scaled token limit, `clean_output`, keeping the draft's own edge whitespace, `safety_check` (protected tokens, 70–130% length, line breaks), `majority_script`, and the errors. Verify with `server/tests/test_polish.py`, which repeats `test/server/polish.test.ts` case for case.
- [x] 4.4 Wire `POST /v1/events` and `GET /summary` to `assist/telemetry.py`, using the log at `telemetry/events.jsonl`. Verify in `server/tests/test_app.py`: posting a batch of 2 appends 2 lines to a temporary log, and `/summary` returns HTML with the withheld counts.
- [x] 4.5 Write `server/tests/test_scenarios_en.py` (design 7): one test per English or language-neutral scenario of the `completion-service`, `polish-service` and `assist-service` specs (main specs plus this change's deltas), named after the scenario, run through `TestClient` with the scripted LM or the fake. Add the coverage check that reads the scenario names from the spec files, leaves out those containing Arabic text, and fails on any name without a test. Verify that all pass, and that adding a made-up English scenario to a spec makes the coverage check fail. Then remove it.
- [x] 4.6 Write `assist/__main__.py`: load the settings, print the same startup line as `server/main.ts` (the model, or why it's unavailable, plus the external warning and the cache state), and run uvicorn on `127.0.0.1:PORT`. Verify by hand: `uv run --project server python -m assist` with `COMPLETION_MODEL=fake` prints the line, and `curl` to `127.0.0.1:5175/health` answers. Verify by test that `server/tests/test_main.py` asserts the bind host is `127.0.0.1`.

## 5. Switch-over (config)

- [x] 5.1 Update the `package.json` scripts:
  - `server` → `uv run --project server --locked python -m assist`;
  - `test` → `vitest run && npm run test:py`;
  - add `test:py`;
  - remove `eval:completion`, `:check`, `:baseline` and `:record`.

  Verify that `npm test` runs both suites and fails when either fails (break one pytest test temporarily).
- [x] 5.2 Update `scripts/demo.ts`:
  - `uvAvailable()` with the install message;
  - `uv sync --project server --locked` with a clear failure message;
  - spawn the Python server.

  Verify with `test/scripts/demo.test.ts`: `uvAvailable` is false for a missing binary, and the message names `uv` and its install command. Then a manual check: `npm run demo` prints the URL and the model, and after Ctrl+C `lsof -i :5175` shows nothing. If `uv run` doesn't pass the signal on, spawn `server/.venv/bin/python` instead (design 9).
- [x] 5.3 Update `.env.example`: `COMPLETION_MODEL` with provider-qualified ids and a local-model example, `COMPLETION_API_BASE`, and `ASSIST_LLM_CACHE` (off by default, and what turning it on stores). Verify against the tester-kit environment-template scenarios.

## 6. Removal of the Node server and the retired eval

- [x] 6.1 Delete `server/*.ts`, `server/models/` and `test/server/`. Verify that `grep -rn "server/.*\.ts\|from '../../server" src scripts eval test dev` finds nothing, and that `npm run typecheck` passes.
- [x] 6.2 Delete the retired completion-eval code:
  - `eval/completion/{run,recording,judge,metrics,gate,criteria,report}.ts`;
  - `criteria.json`, `baseline.json` and `recordings/`;
  - `eval/cli/completion.ts`;
  - `test/eval/completion-{cli,gate,judge,metrics,recording,replay}.test.ts`.

  Keep `cases.jsonl`, `cases.ts`, `reference/` and `test/eval/completion-cases.test.ts`. Verify that `npm test` and `npm run typecheck` pass.
- [x] 6.3 Rewrite `docs/COMPLETION-EVAL.md` as a short note: the dataset, the reference report, and that the live benchmark and replays are retired until the redesigned eval. Verify that no removed command is mentioned: `grep -n "eval:completion" docs README.md CLAUDE.md` finds nothing except the note's own explanation.

## 7. Documentation

- [x] 7.1 Update CLAUDE.md:
  - Commands: `uv run --project server python -m assist` as the server command (`npm run server` noted as an alias only), `test` (Vitest plus pytest), `test:py`, `demo` (testers' single entry point; needs `uv`), with the `eval:completion*` rows removed;
  - Layout: `server/` as the Python package, `server/tests/`, `test/fixtures/`;
  - Hard constraints: the LLM cache is off by default;
  - Conventions: Python under `uv`, and the typed programs as the only LLM path;
  - the note that there's no completion quality gate until the eval change.

  Verify that every command listed runs.
- [x] 7.2 Update README (quick start with `uv`, troubleshooting for a missing `uv`) and `docs/TESTING.md` (requirements with `uv` and its install command, and the banner wording for local-model ids). Verify against the tester-kit "uv in the requirements" and "Fresh start" scenarios.
- [x] 7.3 (Added during implementation, agreed with the user.) Teach the demo page's model banner (`src/demo/model-banner.ts`, Tier 1 demo code) the new model kinds from `/health`: the offline test model, a local model ("a model running on this machine"), Gemini ("(Google)"), and any other external model ("may be sent outside this machine"). Verify with `test/demo/banner.test.ts`.

## 8. Integration checks

- [ ] 8.1 Fresh-clone check: in a temporary clone, run `npm install`, then `npm run demo` with no key. Verify that `uv` installs Python, the banner shows the offline test model, and in the demo an English and an Arabic completion appear as ghost text and polish works.
- [ ] 8.2 Live check with Gemini on the demo page, using synthetic text:
  - completions in English mid-word, Arabic mid-word, and a mixed Arabic/English conversation;
  - polish in English and Arabic;
  - `/summary` shows completion latency p50, including on a long synthetic chat (30+ turns) with the full conversation.

  Record the p50 and a few example completions in the change, next to the reference report's figures. Verify that nothing from the conversation was written under `.cache/` or to the server log.
- [x] 8.3 Run the reference dataset's prefixes once against the new server with Gemini, using a short throwaway script in the scratchpad, not committed. Compare the shown rate and the obvious seam problems with `eval/completion/reference/node-server.md` by eye, and note the differences in the change. Raise any clear regression with the user before archiving.
- [x] 8.4 Final gate: `npm test`, `npm run typecheck`, `npm run build` and `npm run eval:check` (the spelling eval must be unaffected) all pass, and `openspec validate dspy-assist-service --strict` passes.
