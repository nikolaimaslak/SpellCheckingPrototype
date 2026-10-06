## MODIFIED Requirements

### Requirement: Typed model interface
Every LLM call SHALL go through a typed program that declares its inputs and outputs as named, typed fields with descriptions. The service MUST NOT build prompts by concatenating strings or depend on a provider's request format. The programs are:
- **completion:**
  - inputs: approved responses, knowledge base passages, conversation turns, and the agent's text;
  - output: `continuation`, a string.
- **polish:**
  - input: the agent's draft;
  - output: the corrected text, a string.

Model answers SHALL be read leniently in form and strictly in type: a JSON object is found even inside other text or a code fence, or when cut off after its last field, and extra fields are ignored; but every declared output MUST be present with its declared type in the model's own output (a string field never accepts a number, list, object or null converted to text). A model answer that doesn't meet this MUST be reported to the endpoint as unusable output, never as a crash or HTTP 500. The completion endpoint reports it as `withheld: "format"`. The polish endpoint returns the draft unchanged with a reason.

#### Scenario: Completion outputs are typed
- **WHEN** the completion program runs
- **THEN** its result carries the string field `continuation`, whatever model answered

#### Scenario: Unparseable completion answer
- **WHEN** the model answers `Sure! here you go` to a completion request
- **THEN** the completion endpoint answers HTTP 200 with an empty completion and `withheld: "format"`

#### Scenario: Wrapped answer accepted
- **WHEN** the model answers an English completion request with `Here you go: {"continuation": "Anything else?"}`
- **THEN** the program's result carries `continuation` "Anything else?"

#### Scenario: Number not converted
- **WHEN** the model answers an English polish request with `{"polished": 42}`
- **THEN** the polish endpoint answers HTTP 200 with the draft unchanged, `changed: false` and a reason

#### Scenario: Unparseable polish answer
- **WHEN** the model's answer to an English draft, or to an Arabic draft, doesn't contain the corrected-text field
- **THEN** the polish endpoint answers HTTP 200 with the draft unchanged, `changed: false` and a reason

### Requirement: Model call settings
Each program SHALL call its model with:
- low temperature;
- the smallest reasoning effort the provider offers;
- an output token limit;
- no retries of any kind: each request makes exactly one model call, including when structured output fails or can't be parsed;
- a request timeout of 2 seconds for completion and 4 seconds for polish.

Completion MUST ask for structured output with the field `continuation`, using the provider's schema-constrained output where it has one. Provider credentials (such as `GEMINI_API_KEY`) MUST be read from the server environment only. They MUST never appear in replies, logs, error reasons, the LLM cache or the repository.

A timeout MUST answer HTTP 504. Any other model failure MUST answer HTTP 502. No model configured MUST answer HTTP 503. Each error carries a short reason that doesn't echo the provider's response.

#### Scenario: Completion timeout
- **WHEN** the model takes longer than 2 seconds to answer a completion request
- **THEN** the endpoint answers HTTP 504 with a short reason, and no retry is made

#### Scenario: Structured output unparseable
- **WHEN** the model answers an English completion request with output that has no string `continuation`
- **THEN** no second call is made, and the endpoint answers HTTP 200 with an empty completion and `withheld: "format"`

#### Scenario: Structured output rejected
- **WHEN** the provider rejects the structured-output request for an English completion with an error
- **THEN** no second call is made in plain JSON mode, and the endpoint answers HTTP 502

#### Scenario: Provider error
- **WHEN** the provider answers with an authentication error whose body contains request details
- **THEN** the endpoint answers HTTP 502, and the reason contains neither the provider's body nor the key

### Requirement: Offline test model
The offline test model SHALL be a deterministic, non-product model behind the same typed interface as real models, so the demo and the tests run without a key or network:
- **for completion,** it continues the agent's text from the first approved response sent (or, failing that, the first knowledge base passage), answering `{ continuation }`: the rest of that text from where the agent's text stops, with the same choices as the previous `{ word, rest }` answers;
- **for polish,** it applies a fixed list of English and Arabic grammar fixes.

It MUST read its inputs from the program's typed fields, never by parsing prompt text.

#### Scenario: English completion offline
- **WHEN** the approved responses include "Your request has been received and will be processed within 3 working days." and the agent typed "Your request has been rec"
- **THEN** the offline model answers `{ "continuation": "eived and will be processed within 3 working days." }`

#### Scenario: Arabic completion offline
- **WHEN** the approved responses include "تم استلام طلبك وسيتم معالجته خلال ثلاثة أيام عمل." and the agent typed "تم استلا"
- **THEN** the offline model answers `{ "continuation": "م طلبك وسيتم معالجته خلال ثلاثة أيام عمل." }`

#### Scenario: English polish offline
- **WHEN** the draft is "He go to the office and buyed a pen."
- **THEN** the offline model returns "He went to the office and bought a pen."

#### Scenario: Mixed-language polish offline
- **WHEN** the draft is "He go to the office. هذه الطلب قيد المراجعة."
- **THEN** the offline model returns "He went to the office. هذا الطلب قيد المراجعة."

#### Scenario: English continuation after a space offline
- **WHEN** the approved responses include "Your request has been received and will be processed within 3 working days." and the agent typed "Thank you, your request "
- **THEN** the offline model answers `{ "continuation": "has been received and will be processed within 3 working days." }`
