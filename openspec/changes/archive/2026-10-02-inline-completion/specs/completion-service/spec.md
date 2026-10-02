# Spec Delta

## Purpose

The server-side (Tier 2) service that predicts the rest of the agent's sentence from the live conversation and the service's canned responses. In the prototype it runs as a local stand-in for the Intelligence Engine, backed by a hosted model.

## ADDED Requirements

### Requirement: Completion endpoint contract
The service SHALL expose `POST /v1/complete`.
- **Request (JSON):** the agent's text before the caret (`prefix`), the recent transcript as `{ role: 'customer' | 'agent', text }` turns, and the enabled context sources.
- **Reply on success (JSON):** `{ completion, lang, latencyMs, model, sources }`, where `completion` is the text to append (possibly empty) and `sources` lists the identifiers of the canned responses used.

The client MUST reach the service through a configurable base URL, so it can be replaced without changing the client.

#### Scenario: Successful completion
- **WHEN** the client posts a prefix and transcript
- **THEN** the reply carries a completion string, its language, the service-side latency and the model name

#### Scenario: Nothing useful to add
- **WHEN** the model's output is empty or rejected by post-processing
- **THEN** the reply carries an empty completion with HTTP 200

### Requirement: Context assembly
The service SHALL build the model prompt from cheapest to most expensive: the most recent transcript turns (always, when enabled), then up to 3 canned responses ranked by lexical similarity to the customer's last message and the prefix (when enabled). It MUST compare Arabic text with diacritics, tatweel and alef/hamza variants normalized for retrieval. The stable parts (instructions, canned snippets, transcript) MUST come before the prefix, so repeated requests share a prompt prefix.

#### Scenario: Canned response steers wording
- **WHEN** the customer asked about pension contribution status and a canned response about contribution status exists
- **THEN** that response is among the sources and appears in the prompt

#### Scenario: Arabic retrieval
- **WHEN** the customer wrote "استعلام عن الاشتراكات" and a canned response mentions "الإشتراكات"
- **THEN** the canned response is retrieved despite the hamza difference

#### Scenario: Sources disabled
- **WHEN** canned responses are disabled in the request
- **THEN** no canned response is retrieved or sent to the model

### Requirement: Model call
The service SHALL call the configured model (dev: Google Gemini `gemini-3.5-flash-lite`) with low temperature, minimal reasoning, a short output limit and a request timeout. The API key MUST be read from the server environment only, and MUST never appear in replies, logs or the repository.

#### Scenario: Key missing
- **WHEN** the server starts without `GEMINI_API_KEY`
- **THEN** it still serves telemetry, and `POST /v1/complete` answers HTTP 503 with a reason that says the model is unavailable

#### Scenario: Upstream failure or timeout
- **WHEN** the model call fails or exceeds the timeout
- **THEN** the endpoint answers HTTP 502 or 504 with a short reason, and the client shows no ghost text

### Requirement: Output post-processing
The service SHALL turn the model output into a safe continuation: no repetition of the prefix, at most one sentence (cut after the first sentence terminator), at most 20 words, a single line, and in the same script as the prefix's last word. It MUST add a leading space when the prefix doesn't end in whitespace and the continuation starts a new word. Output failing these rules MUST be returned as an empty completion.

#### Scenario: Model repeats the prefix
- **WHEN** the model returns "your request will be processed soon." for the prefix "Thank you, your request"
- **THEN** the completion is " will be processed soon."

#### Scenario: Multiple sentences
- **WHEN** the model returns " will be processed. Anything else?"
- **THEN** the completion is " will be processed."

#### Scenario: Wrong language
- **WHEN** the prefix ends with an Arabic word and the model returns English
- **THEN** the completion is empty
