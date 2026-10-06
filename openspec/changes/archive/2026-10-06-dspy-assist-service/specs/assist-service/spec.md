# Spec Delta

## Purpose

The Tier 2 server runtime shared by completion, polish and telemetry: request handling, and a typed, model-independent interface to the LLM, chosen by configuration, so the hosted dev model can be swapped for the production local model without code changes.

## ADDED Requirements

### Requirement: Service runtime
The service SHALL listen on `127.0.0.1` only, on `PORT` (default 5175), and serve `POST /v1/complete`, `POST /v1/polish`, `POST /v1/events`, `GET /summary` and `GET /health`. Any other path MUST answer HTTP 404 with `{ "error": "not found" }`.

**Request bodies:**
- A body that isn't valid JSON, or is larger than 64 KiB, MUST answer HTTP 400 with `{ "error": "bad request" }`.
- Every error reply MUST be JSON of the form `{ "error": <short reason> }`, using the statuses the endpoint specs define. A request whose fields fail validation MUST never answer with a framework-specific status or body (such as HTTP 422).

**Headers on every reply:**
- `access-control-allow-origin: *`, `access-control-allow-headers: content-type` and `access-control-allow-private-network: true`, so the dev loader on a live Agent Desktop page can call it;
- `cache-control: no-store`.

A preflight `OPTIONS` request MUST answer HTTP 204.

**Environment:** the service MUST read settings from the environment, and from a `.env` file at the repository root for variables the environment doesn't set.

#### Scenario: Loopback only
- **WHEN** the service starts
- **THEN** it accepts connections on 127.0.0.1:5175 and not on other interfaces

#### Scenario: Invalid JSON
- **WHEN** a client posts `{"prefix":` to `/v1/complete`
- **THEN** the service answers HTTP 400 with `{ "error": "bad request" }`

#### Scenario: Body too large
- **WHEN** a client posts a 100 KiB body to `/v1/polish`
- **THEN** the service answers HTTP 400 and doesn't call the model

#### Scenario: Validation error keeps the contract
- **WHEN** a client posts `{ "prefix": 42 }` to `/v1/complete`
- **THEN** the service answers HTTP 400 with `{ "error": "prefix is required" }`, not HTTP 422

#### Scenario: Cross-origin preflight
- **WHEN** the dev loader sends `OPTIONS /v1/complete` from an Agent Desktop origin
- **THEN** the service answers HTTP 204 with the CORS and private-network headers

#### Scenario: Environment wins over .env
- **WHEN** `.env` sets `COMPLETION_MODEL=gemini` and the environment sets `COMPLETION_MODEL=fake`
- **THEN** the service uses the offline test model

### Requirement: Typed model interface
Every LLM call SHALL go through a typed program that declares its inputs and outputs as named, typed fields with descriptions. The service MUST NOT build prompts by concatenating strings or depend on a provider's request format. The programs are:
- **completion:**
  - inputs: approved responses, knowledge base passages, conversation turns, and the agent's text;
  - outputs: `word` and `rest`, both strings.
- **polish:**
  - input: the agent's draft;
  - output: the corrected text, a string.

Model answers SHALL be read leniently in form and strictly in type: a JSON object is found even inside other text or a code fence, or when cut off after its last field, and extra fields are ignored; but every declared output MUST be present with its declared type in the model's own output (a string field never accepts a number, list, object or null converted to text). A model answer that doesn't meet this MUST be reported to the endpoint as unusable output, never as a crash or HTTP 500. The completion endpoint reports it as `withheld: "format"`. The polish endpoint returns the draft unchanged with a reason.

#### Scenario: Completion outputs are typed
- **WHEN** the completion program runs
- **THEN** its result carries the string fields `word` and `rest`, whatever model answered

#### Scenario: Unparseable completion answer
- **WHEN** the model answers `Sure! here you go` to a completion request
- **THEN** the completion endpoint answers HTTP 200 with an empty completion and `withheld: "format"`

#### Scenario: Wrapped answer accepted
- **WHEN** the model answers an English completion request with `Here you go: {"word": "", "rest": "Anything else?"}`
- **THEN** the program's result carries `word` "" and `rest` "Anything else?"

#### Scenario: Number not converted
- **WHEN** the model answers an English polish request with `{"polished": 42}`
- **THEN** the polish endpoint answers HTTP 200 with the draft unchanged, `changed: false` and a reason

#### Scenario: Unparseable polish answer
- **WHEN** the model's answer to an English draft, or to an Arabic draft, doesn't contain the corrected-text field
- **THEN** the polish endpoint answers HTTP 200 with the draft unchanged, `changed: false` and a reason

### Requirement: Model selection
The service SHALL choose the model from `COMPLETION_MODEL`:
- `auto` (the default): the hosted Gemini model when `GEMINI_API_KEY` is set, otherwise the offline test model;
- `gemini`: the hosted Gemini model only, unavailable without `GEMINI_API_KEY`;
- `fake`: the offline test model only;
- a provider-qualified model id (`<provider>/<model>`, for example `ollama_chat/qwen3:8b`): that model, reached at `COMPLETION_API_BASE` when set.

Unknown values without a provider prefix MUST fall back to `auto` with a warning at startup.

The service MUST know whether a model sends text outside the machine:
- the offline test model doesn't;
- a model whose `COMPLETION_API_BASE` is a loopback address doesn't;
- the `ollama` and `ollama_chat` providers without an API base don't;
- every other model does.

`GET /health` SHALL report `{ ok, model, mode, external, cache }`:
- `model`: the active model id, or null when unavailable;
- `mode`: the selection mode;
- `external`: whether text leaves the machine;
- `cache`: whether the LLM request cache is on.

Switching models MUST need no code change.

`COMPLETION_MAX_TURNS` (optional) limits how many of the most recent conversation turns completion passes to the model. Unset means the full conversation. A value that isn't a positive whole number MUST be ignored with a startup warning.

#### Scenario: Default without a key
- **WHEN** the service starts with no `COMPLETION_MODEL` and no `GEMINI_API_KEY`
- **THEN** `/health` reports the offline test model, mode `auto` and `external: false`

#### Scenario: Default with a key
- **WHEN** the service starts with no `COMPLETION_MODEL` and a `GEMINI_API_KEY`
- **THEN** `/health` reports the Gemini model and `external: true`

#### Scenario: Local model by id
- **WHEN** the service starts with `COMPLETION_MODEL=ollama_chat/qwen3:8b`
- **THEN** completion and polish use that model, and `/health` reports it with `external: false`

#### Scenario: Model on a remote endpoint
- **WHEN** the service starts with `COMPLETION_MODEL=hosted_vllm/some-model` and `COMPLETION_API_BASE=https://llm.example.com/v1`
- **THEN** `/health` reports `external: true`

#### Scenario: Invalid turn limit
- **WHEN** the service starts with `COMPLETION_MAX_TURNS=0` or `COMPLETION_MAX_TURNS=all`
- **THEN** it logs a warning and passes the full conversation

#### Scenario: Unknown value
- **WHEN** the service starts with `COMPLETION_MODEL=gpt`
- **THEN** it logs a warning and behaves as `auto`

### Requirement: Model call settings
Each program SHALL call its model with:
- low temperature;
- the smallest reasoning effort the provider offers;
- an output token limit;
- no retries of any kind: each request makes exactly one model call, including when structured output fails or can't be parsed;
- a request timeout of 2 seconds for completion and 4 seconds for polish.

Completion MUST ask for structured output with the fields `word` and `rest`, using the provider's schema-constrained output where it has one. Provider credentials (such as `GEMINI_API_KEY`) MUST be read from the server environment only. They MUST never appear in replies, logs, error reasons, the LLM cache or the repository.

A timeout MUST answer HTTP 504. Any other model failure MUST answer HTTP 502. No model configured MUST answer HTTP 503. Each error carries a short reason that doesn't echo the provider's response.

#### Scenario: Completion timeout
- **WHEN** the model takes longer than 2 seconds to answer a completion request
- **THEN** the endpoint answers HTTP 504 with a short reason, and no retry is made

#### Scenario: Structured output unparseable
- **WHEN** the model answers an English completion request with output that doesn't match `word` and `rest`
- **THEN** no second call is made, and the endpoint answers HTTP 200 with an empty completion and `withheld: "format"`

#### Scenario: Structured output rejected
- **WHEN** the provider rejects the structured-output request for an English completion with an error
- **THEN** no second call is made in plain JSON mode, and the endpoint answers HTTP 502

#### Scenario: Provider error
- **WHEN** the provider answers with an authentication error whose body contains request details
- **THEN** the endpoint answers HTTP 502, and the reason contains neither the provider's body nor the key

### Requirement: LLM request cache
The service SHALL cache LLM requests only when `ASSIST_LLM_CACHE` is `on`. The default is `off`, because a cached request holds the full prompt, including conversation text.
- **When on:** identical requests within a run MAY be answered from the cache, and the on-disk cache MUST be written under `.cache/llm/` at the repository root, which is excluded from version control.
- **When off:** nothing about a request MUST be kept in memory or written to disk after the request ends.

#### Scenario: Cache off by default
- **WHEN** the service handles a completion with no `ASSIST_LLM_CACHE` set
- **THEN** no file is written under `.cache/`, and two identical requests both reach the model

#### Scenario: Cache on
- **WHEN** `ASSIST_LLM_CACHE=on` and the same completion request is sent twice
- **THEN** the second is answered without calling the model, and the cache files are under `.cache/llm/`, which git ignores

### Requirement: Offline test model
The offline test model SHALL be a deterministic, non-product model behind the same typed interface as real models, so the demo and the tests run without a key or network:
- **for completion,** it continues the agent's text from the first approved response sent (or, failing that, the first knowledge base passage), answering `{ word, rest }` the same way the previous server's test model did;
- **for polish,** it applies a fixed list of English and Arabic grammar fixes.

It MUST read its inputs from the program's typed fields, never by parsing prompt text.

#### Scenario: English completion offline
- **WHEN** the approved responses include "Your request has been received and will be processed within 3 working days." and the agent typed "Your request has been rec"
- **THEN** the offline model answers `{ "word": "received", "rest": " and will be processed within 3 working days." }`

#### Scenario: Arabic completion offline
- **WHEN** the approved responses include "تم استلام طلبك وسيتم معالجته خلال ثلاثة أيام عمل." and the agent typed "تم استلا"
- **THEN** the offline model answers `{ "word": "استلام", "rest": " طلبك وسيتم معالجته خلال ثلاثة أيام عمل." }`

#### Scenario: English polish offline
- **WHEN** the draft is "He go to the office and buyed a pen."
- **THEN** the offline model returns "He went to the office and bought a pen."

#### Scenario: Mixed-language polish offline
- **WHEN** the draft is "He go to the office. هذه الطلب قيد المراجعة."
- **THEN** the offline model returns "He went to the office. هذا الطلب قيد المراجعة."
