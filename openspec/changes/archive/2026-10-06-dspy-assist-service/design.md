# Design

## Context

For motivation, see proposal.md.

**Today's server** (Tier 2) is about 900 lines of TypeScript that Node runs directly (`server/`):
- **Request handling:** a hand-rolled `node:http` router (`main.ts`).
- **Prompts:** built as strings (`prompt.ts`, and `POLISH_INSTRUCTION` in `polish.ts`).
- **Models:** a Gemini REST client (`models/gemini.ts`) and a fake that parses the prompt text back apart (`models/fake.ts`).
- **Deterministic code:** retrieval (`retrieval.ts`), assembly and the withheld checks (`postprocess.ts`), and telemetry (`telemetry.ts`). Telemetry imports the spelling taxonomy from `eval/error-types.ts`.

**Who depends on it:**
- **Over HTTP:** the browser client (`src/completion/client.ts`, `src/polish/`, `src/telemetry/`), through the Vite `/api` proxy, and the dev loader, cross-origin.
- **In process:** `eval/completion/run.ts` and `recording.ts`, and `scripts/demo.ts`, which spawns the server.

Nothing changes in Tier 1 (the browser). The HTTP contract is the boundary, and the specs keep it exact.

## Goals / Non-Goals

**Goals:**
- The model is called only through typed DSPy programs, and the model is chosen by configuration.
- The HTTP behavior is identical: the same bodies, statuses, headers and port, so no client change is needed.
- The deterministic parts are ported line for line and checked by the same test cases, so any behavior difference is a test failure, not a surprise.
- `npm run demo` and `npm test` stay single commands.

**Non-Goals (design-level):**
- No streaming. Completion answers fit in 64 tokens.
- No async job queue, workers or multiple processes. A single uvicorn worker is enough for a loopback dev server.
- No Python type checker in CI. There's no CI. The code uses type hints and pydantic models, and adding a type checker is an open question.

## Decisions

### 1. Package layout (Tier 2)

```
server/
  pyproject.toml   uv.lock   .python-version (3.13)
  data/            canned.json, kb.json            (unchanged)
  assist/
    __main__.py    reads settings, runs uvicorn on 127.0.0.1:PORT
    app.py         create_app(settings) -> FastAPI: routes, error handlers, CORS/no-store middleware
    settings.py    .env loader, env parsing, model selection (auto|gemini|fake|<provider>/<model>), external flag
    lm.py          builds the dspy.LM (or None), cache and history settings, error classification
    programs.py    CompleteSentence / PolishDraft signatures and the modules that run them; offline fake predictors
    complete.py    POST /v1/complete: parse → retrieve → program → assemble → finalize
    polish.py      POST /v1/polish: parse → program → clean → safety checks
    postprocess.py assemble, finalize, script_of        (port of postprocess.ts)
    retrieval.py   normalize, tokens, rank, retrieve, kb_passages, retrieve_kb   (port)
    telemetry.py   sanitize, append/read events, summarize, render_summary     (port)
    error_types.py classify and what it needs   (port of the classifier half of eval/error-types.ts)
  tests/           pytest, one file per module, plus test_scenarios_en.py
test/fixtures/error-types.json   shared by test/eval/error-types.test.ts and server/tests/test_error_types.py
```

`create_app(settings)` takes its settings and model as arguments, so tests build an app with a scripted model and call it through FastAPI's `TestClient` (httpx), in process. The tests open no ports.

- **Alternative: a top-level `service/` directory** instead of reusing `server/`. Rejected: `server/data/`, the `/api` proxy target and the CLAUDE.md layout already mean "Tier 2 dev stand-in". Keeping the name avoids churn.
- **Alternative: a separate repo.** Rejected: the demo, the tests and the specs move together.

### 2. FastAPI with strict control over the error shape

FastAPI answers validation failures with HTTP 422 and its own body. The contract is HTTP 400 with `{ error }` and exact messages ("prefix is required", "prefix too long", "text is required", "text too long"). So the handlers:
- read the raw body themselves (64 KiB cap; invalid JSON gives 400 "bad request");
- validate leniently in Python, as the TypeScript code did: malformed turns are dropped, the 50-turn cap applies and `sources` flags default to true;
- build typed pydantic request objects from that, and declare pydantic reply models (`CompleteReply`, `PolishReply`) as `response_model`. `edit` and `withheld` are excluded when unset (`response_model_exclude_none`).

Two handlers replace the framework defaults: one for `RequestValidationError` and one for any other uncaught exception. They map to 400 and 500 with `{ error }`, and the 500 never includes exception text.

The CORS and `cache-control` headers come from a small custom middleware that copies today's headers exactly, including `access-control-allow-private-network`. Starlette's `CORSMiddleware` doesn't emit that header for every request.

### 3. Typed programs (DSPy), instructions carried over

```python
class CompleteSentence(dspy.Signature):
    """<today's systemInstruction(), reworded to name the fields>"""
    approved_responses: list[str] = dspy.InputField(desc="approved wording; may be empty")
    knowledge_base: list[str] = dspy.InputField(desc="'Title: passage' facts; may be empty")
    conversation: list[Turn] = dspy.InputField(desc="last turns, oldest first; may be empty")
    agent_text: str = dspy.InputField(desc="what the agent has typed so far, up to the caret")
    word: str = dspy.OutputField(desc="the last word of agent_text written in full; empty after a space or punctuation")
    rest: str = dspy.OutputField(desc="what follows word, starting with a space or punctuation as needed")

class PolishDraft(dspy.Signature):
    """<today's POLISH_INSTRUCTION, reworded to name the fields>"""
    draft: str = dspy.InputField()
    polished: str = dspy.OutputField(desc="the corrected draft only")
```

- **Field order** gives the "stable first" property the spec requires, because the adapter renders the inputs in declaration order.
- **Conversation length:** by default the full conversation the request carries goes to the model. `COMPLETION_MAX_TURNS` optionally keeps only the last N turns. This changes today's behavior: `buildUserContent` kept the last 6. The request parser's 50-turn cap and the 64 KiB body limit still bound the input.
- **Modules:** each program is a `dspy.Module` wrapping one `dspy.Predict`. The later optimizer change tunes exactly these modules (their instructions and demos) and saves them as JSON. This change saves nothing.
- **Adapter: always `dspy.JSONAdapter`,** for every program (completion and polish) and every model. It's set once at startup and attached to each module, so no call can run through DSPy's default `ChatAdapter`. JSONAdapter asks for schema-constrained output (`response_format` with a JSON schema) where LiteLLM reports support, as with Gemini, and plain JSON mode otherwise.
  - Why not `ChatAdapter`: when parsing fails it retries through the JSON adapter, which is a second model call and would break the 2-second budget.
  - **No retries at this phase, of any kind:** no LiteLLM retries (`num_retries=0`) and no adapter fallback. In DSPy 3.4, `JSONAdapter` picks the response format before the call and never falls back to another adapter, so every request makes exactly one model call (checked by test). A failed or unparseable answer is withheld as `format` (completion) or returns the draft unchanged (polish).
  - **Parsing: lenient in form, strict in type** (decided during implementation). DSPy's `JSONAdapter.parse` finds a JSON object inside prose or a fence, repairs a cut-off object (`json_repair`) and ignores extra fields; that is kept. It also converts values to the declared type (a number `5` to `"5"`), which is not: a small `JSONAdapter` subclass checks that each declared `str` output is a string in the model's own output before handing over to DSPy's parse. `json-repair` (MIT) becomes a direct dependency for that check.
  - Polish therefore gets its corrected text back as a JSON field, not free text. `clean_output` still strips fences and quotes from the field's value.
- **Alternative: keep the hand-built prompt and call LiteLLM directly.** Rejected. It gives no typed interface, and nothing for the later optimizer to work on.

### 4. Model selection and the LM (config, Tier 2)

`settings.py` keeps today's `selectModel` semantics and adds provider-qualified ids:

| `COMPLETION_MODEL` | LM | `external` |
|---|---|---|
| `auto` with `GEMINI_API_KEY` set, or `gemini` with it set | `gemini/gemini-3.5-flash-lite` | true |
| `auto` without the key, or `fake` | offline fake (decision 5) | false |
| `gemini` without the key | none, so the endpoints answer 503 | false |
| `<provider>/<model>` | that id, with `api_base=COMPLETION_API_BASE` when set | false if the API base is loopback, or the provider is `ollama`/`ollama_chat` with no API base; true otherwise |
| anything else | as `auto`, with a startup warning | as `auto` |

The external rule leans to the safe side. An unknown remote provider is reported as external, so the demo banner warns about it.

**One `dspy.LM`, built at startup, with `engine="litellm"`.** DSPy 3.4's default engine (`auto`) prefers its own vendored client (lm15) over LiteLLM; pinning `litellm` keeps the transport the design and the tests describe. Each request runs inside `dspy.context(lm=…, adapter=…, disable_history=True, track_usage=False)`, a context variable, so concurrent requests don't race; we never call `dspy.configure(lm=...)`, which is process-global. The LM settings:
- `temperature=0.2`;
- `num_retries=0`;
- `max_tokens`: 64 for completion; for polish, `min(2048, ceil(len/2)+64)` per call through `config`;
- `timeout`: 2 seconds for completion, 4 for polish;
- `reasoning_effort="minimal"` with LiteLLM `drop_params=True`, so providers without the parameter ignore it rather than fail. Verified offline (`test_gemini_request.py`): LiteLLM sends Gemini `thinkingConfig: { thinkingLevel: "minimal", includeThoughts: true }`, with `response_json_schema` for `word` and `rest` and no stop sequences. Whether `includeThoughts` costs output tokens is checked in the live run (task 8.2).

The endpoint calls `await program.acall(...)` inside `asyncio.wait_for(timeout)`. This is the hard bound, in case a provider ignores its own timeout.

**Error mapping** (`lm.classify_error`):

| Raised | Outcome |
|---|---|
| `asyncio.TimeoutError`, `litellm.Timeout` | 504 |
| DSPy `AdapterParseError` | completion: 200 with `withheld: "format"`; polish: 200 with the draft unchanged and a reason |
| any other exception | 502 |

The reason text is fixed per status and never echoes the exception.

**Logging:** LiteLLM debug and usage telemetry are off (`litellm.telemetry = False`, `suppress_debug_info = True`), and DSPy's LM call history is disabled. Both would otherwise keep or print prompts.

### 5. Offline test model at the program level

The spec requires the fake to read typed fields, not prompt text. A `dspy.BaseLM` only ever sees the rendered messages, so the fake can't be an LM. Instead, `fake` mode swaps each program's predictor for a deterministic `FakeCompletePredict` / `FakePolishPredict`. These take the same typed inputs and return a `dspy.Prediction(word=..., rest=...)` or `dspy.Prediction(polished=...)`. The logic is today's `fake.ts`, ported:
- **completion:** it continues from the first approved response, or failing that the first KB passage's text;
- **polish:** it applies the fixed grammar fixes.

The model name stays `fake`.

The fake never goes through the adapter, so offline tests also cover the adapter path separately. They use a **scripted model** (`server/tests/conftest.py`): the real `dspy.LM`, adapter and LiteLLM response handling run, and only `litellm.acompletion` is replaced by one that records what DSPy sent and answers with LiteLLM's `mock_response`, or raises a scripted error. (Implementation note: a `dspy.BaseLM` subclass was planned, but DSPy 3.4 deprecates that interface, and the LiteLLM-level double also exercises the real LM path.) Given raw strings include valid JSON, `Sure! {"word": …}` and `rest` given as a number; that's how the format and parse-error scenarios run end to end.

- **Alternative: a fake `BaseLM` that parses the adapter's rendered prompt.** Rejected: it ties the tests to DSPy's private rendering format, which is the same fragility today's fake has.

### 6. LLM cache (config)

DSPy's cache is process-global. At startup, the service calls `dspy.configure_cache(enable_disk_cache=on, enable_memory_cache=on, disk_cache_dir="<repo>/.cache/llm")` and builds the LM with `cache=on`. The default is off. In that case neither the memory nor the disk cache is used, and nothing is written to `.cache/`.

`.cache/` is added to `.gitignore`, and `/health` gains `cache: bool`. The browser client ignores unknown health fields, and `scripts/demo.ts` reads only `model` and `external`.

### 7. Porting the deterministic code

The two languages differ in ways the port has to handle:

| Concern | TypeScript | Python |
|---|---|---|
| Unicode property regexes (`\p{L}`, `\p{Script=Arabic}`, `\p{Nd}`) | built in | the stdlib `re` doesn't support them, so we use the `regex` package, already a LiteLLM dependency, and declare it directly |
| Lookahead `(?=\s\|$)`, `u` flag | yes | the same in `regex` |
| String length and slicing | UTF-16 code units | code points |
| `toLowerCase()` | locale-free | `str.lower()` (not `casefold`, which would change "ß" comparisons) |

On length: Arabic and Latin text is all in the Basic Multilingual Plane, so `typed.length` and slices agree between the two languages. Characters outside it (emoji) could shift `edit` offsets. The client uses only `completion`, so this is accepted and covered by one test with an emoji in the prefix.

**Proof of the port:**
- every TypeScript test in `test/server/postprocess`, `retrieval`, `kb`, `polish`, `telemetry`, `complete` and `model-select` is re-expressed in pytest with the same inputs and expected values;

**English scenario suite.** `test_scenarios_en.py` runs every English and language-neutral scenario of the `completion-service`, `polish-service` and `assist-service` specs (the main specs plus this change's deltas). It runs them through `TestClient`, with the scripted LM giving the scenario's model answer, or with the fake. Each test is named after its scenario. A scenario counts as language-neutral when its text has no Arabic, for example "Key missing", "Too long" or "Stable fields first".

A check in the same file reads the scenario names from those spec files, leaves out the ones that contain Arabic text, and fails when any remaining name has no test. That way a new English scenario can't go untested.

Arabic and mixed Arabic/English scenarios are a separate change, with its own discussion and review. In this change they're covered only where the ported tests already cover them.

### 8. Shared error-type fixture

`test/fixtures/error-types.json` holds `[{ misspelled, intended, lang, type | null }]`. It covers every English and Arabic type, `multi`, `boundary`, pairs that are equal once marks are removed, and pairs in mixed scripts.
- **Vitest:** `test/eval/error-types.test.ts` gains a block that runs the fixture through `classify`.
- **pytest:** `server/tests/test_error_types.py` runs it through the Python port.

The fixture is built from the existing `error-types.test.ts` cases plus the telemetry spec's examples. Only `classify` and its helpers are ported. The injection half (`variants`, `apply`, `mulberry32`) stays TypeScript-only, because only the spelling eval uses it.

### 9. Scripts and tooling (config)

| Script | Becomes |
|---|---|
| `server` | `uv run --project server --locked python -m assist`  (alias only; the documented server command is the `uv run` itself) |
| `test` | `vitest run && npm run test:py` |
| `test:py` (new) | `uv run --project server --locked pytest server/tests -q` |
| `eval:completion*` | removed |

`scripts/demo.ts` gains three things:
- `uvAvailable()` (runs `uv --version`), with a clear message and the install command when it fails;
- `uv sync --project server --locked` before the servers start;
- the server spawned through `uv run … python -m assist`.

Clean shutdown relies on `uv run` passing SIGTERM and SIGINT to its child. A test in `test/scripts/demo.test.ts` (or a manual check) confirms that nothing keeps listening on 5175 after Ctrl+C. If `uv run` doesn't pass the signal reliably, the script spawns `server/.venv/bin/python` directly after the sync.

The Python version is pinned in `.python-version` (3.13). DSPy 3.4 supports up to 3.14, and `uv` installs the pinned version itself.

### 10. Retiring the completion eval

Kept as they are:
- `eval/completion/cases.jsonl`, the dataset;
- `eval/completion/cases.ts` and `test/eval/completion-cases.test.ts`, the loader and its test, since it imports only `node:` modules.

Removed:
- `run.ts`, `recording.ts`, `judge.ts`, `metrics.ts`, `gate.ts`, `criteria.ts`, `report.ts`, `criteria.json`, `baseline.json` and `recordings/`;
- `eval/cli/completion.ts`;
- `test/eval/completion-{cli,gate,judge,metrics,recording,replay}.test.ts`.

Before removal, one `npm run eval:completion` run with Gemini on the Node server is committed as `eval/completion/reference/node-server.md`. It's the reference the redesigned eval is compared with. `docs/COMPLETION-EVAL.md` is cut down to a short note: the dataset, the reference report and "redesign pending".

### Tier and UI interactions

- **Tier 2:** everything in `server/`.
- **Config:** `.env`, `.env.example`, `.gitignore`, `package.json` scripts and `scripts/demo.ts`.
- **Tier 1:** nothing changes.
- **Undo, the editable DOM and RTL layout:** no interaction. The client receives the same completion and polish replies, so the ghost text, accepts, undo and the bidi handling are untouched.

## Risks / Trade-offs

- **The prompt changes shape,** from a hand-built prompt to one the JSON adapter renders, so suggestion quality may shift and no live gate exists until the eval change. → Carry the instructions over with the same rules. Keep the reference report. Check by hand with the demo in English and Arabic with Gemini (a tasks.md step). Run the old dataset's cases once against the new server and compare them with the reference by eye.
- **Longer prompts by default:** passing the full conversation instead of the last 6 turns adds input tokens and latency on long chats. → Measure p50 on a long synthetic chat in task 8.2. If it is a problem, set `COMPLETION_MAX_TURNS`; no code change is needed.
- **Repaired output reaches the agent:** a cut-off answer (output token limit hit mid-`rest`) is repaired and shown cut short, where the Node server withheld it. → It still passes assembly and `finalize` (one sentence, 20 words, script). Watch for truncated suggestions in the live check (task 8.2).
- **Latency:** DSPy and LiteLLM add per-call overhead, and the JSON adapter adds field markers to the prompt. → The budget is 2 seconds, and Python overhead is a few milliseconds. Measure p50 on the demo (the telemetry summary shows completion latency) and note it in the change.
- **`reasoning_effort` mapping for Gemini 3 in LiteLLM** may differ, or the parameter may be dropped silently. → An implementation task checks the outgoing request with LiteLLM's mock or logging in a test. If the mapping isn't supported, pass Gemini's `thinking` setting explicitly for the `gemini/` provider.
- **Prompts kept in memory or logs by DSPy or LiteLLM** (history, debug, callbacks) would break the data-handling rule. → Turn off history, debug and telemetry at startup, and add a test that runs a request and asserts the LM history is empty and nothing was written under `.cache/`.
- **Two copies of the error classifier.** → The shared fixture fails both suites when either copy drifts.
- **Testers need `uv`.** → `npm run demo` checks for it with a one-line install hint. README and TESTING.md are updated.
- **Transitive licenses:** DSPy pulls in many packages (LiteLLM, openai, optuna and others). → An audit of the whole locked set (`uv pip list` plus license metadata) is a task, done before the lockfile is committed. Anything GPL or LGPL blocks the change.
- **Retiring the eval means no regression gate for a while.** → Accepted by the user. CLAUDE.md states that there is no completion gate until the eval change.

## Migration Plan

1. Run the live completion benchmark on the Node server and commit the reference report.
2. Build the Python server next to the TypeScript one, under `server/assist/`, and pass every ported test and every English spec scenario. Node and Python don't run at the same time: both use port 5175.
3. Switch the `package.json` scripts and `scripts/demo.ts`.
4. Delete the TypeScript server, its tests and the retired eval code.
5. Update the docs.

**Rollback:** revert the change's commits. No data migrates, and `telemetry/events.jsonl` keeps the same format.

## Open Questions

- **Python linting and type checking** (ruff, pyright or mypy). These are useful, but they don't change behavior or this change's tasks, and can be added as a small follow-up.
- **The local production model's id and serving stack.** These are configuration only (`COMPLETION_MODEL`, `COMPLETION_API_BASE`) and don't change this design.
