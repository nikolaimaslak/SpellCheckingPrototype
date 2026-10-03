# Spec Delta

## MODIFIED Requirements

### Requirement: Model call
The service SHALL select its model from `COMPLETION_MODEL`:
- `auto` (the default): Gemini when `GEMINI_API_KEY` is set, otherwise the offline test model;
- `gemini`: Gemini only, unavailable without a key;
- `fake`: the offline test model only.

It SHALL call Gemini (`gemini-3.5-flash-lite`) with low temperature, minimal reasoning, a short output limit and a request timeout. The API key MUST be read from the server environment only, and MUST never appear in replies, logs or the repository. `GET /health` MUST report the active model, whether it sends text outside the machine, and the selection mode.

#### Scenario: Key missing
- **WHEN** the server starts with the default mode and no `GEMINI_API_KEY`
- **THEN** it uses the offline test model, and `/health` reports it as not sending text externally

#### Scenario: Key present in auto mode
- **WHEN** the server starts with the default mode and a `GEMINI_API_KEY`
- **THEN** it uses Gemini, and `/health` reports that text is sent externally

#### Scenario: Gemini forced without a key
- **WHEN** the server starts with `COMPLETION_MODEL=gemini` and no key
- **THEN** it still serves telemetry, and `POST /v1/complete` answers HTTP 503 with a reason that says the model is unavailable

#### Scenario: Upstream failure or timeout
- **WHEN** the model call fails or exceeds the timeout
- **THEN** the endpoint answers HTTP 502 or 504 with a short reason, and the client shows no ghost text
