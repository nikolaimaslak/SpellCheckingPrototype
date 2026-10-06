# polish-service Specification

## Purpose

The server-side (Tier 2) grammar and spelling corrector behind the Polish button, for Arabic and English drafts. It is constrained to minimal corrections and checked so it can't alter protected content or rewrite the message.

## Requirements

### Requirement: Polish endpoint contract
The service SHALL expose `POST /v1/polish`.
- **Request (JSON):** `{ text }`, the agent's draft as plain text, at most 4000 characters.
- **Reply on success:** `{ polished, changed, lang, latencyMs, model, reason? }`, where `polished` equals `text` and `changed` is false when nothing should change. An empty or oversized draft MUST be rejected with HTTP 400.

#### Scenario: Corrections returned
- **WHEN** the draft "He go to the office yesterday and buyed a pen." is posted
- **THEN** the reply carries a corrected `polished` text with `changed: true` and `lang: "en"`

#### Scenario: Too long
- **WHEN** a draft over 4000 characters is posted
- **THEN** the service answers HTTP 400

### Requirement: Minimal-correction instructions
The service SHALL run a typed polish program whose input is the draft and whose output is the corrected text. It runs on the model selected by the service runtime (`assist-service`), with a 4-second timeout and an output limit that scales with the draft's length.

The program's instructions MUST tell the model to:
- fix grammar, spelling and punctuation only;
- write in the draft's own language;
- keep the draft's meaning, tone, wording and line breaks;
- keep placeholders, URLs, email addresses, numbers and reference codes exactly as written.

Wrappers the model adds around the corrected text (code fences, surrounding quotes) MUST be removed, and the draft's own leading and trailing whitespace kept, before the safety checks run.

#### Scenario: English draft
- **WHEN** an English draft with grammatical errors is posted
- **THEN** the corrected text is English, and its meaning and wording are otherwise unchanged

#### Scenario: Arabic draft
- **WHEN** an Arabic draft with grammatical errors is posted
- **THEN** the corrected text is Arabic, and its meaning and wording are otherwise unchanged

#### Scenario: Mixed draft
- **WHEN** the draft "He go to the office. هذه الطلب قيد المراجعة." is posted to the offline test model
- **THEN** the reply carries "He went to the office. هذا الطلب قيد المراجعة." with `changed: true` and `lang: "ar"` (the script with more letters)

#### Scenario: Fenced answer
- **WHEN** the model wraps the corrected text in a code fence or in quotes
- **THEN** the wrapper is removed before the safety checks, and the reply's `polished` carries only the text

#### Scenario: Trailing line break kept
- **WHEN** the draft ends with a line break and the model's answer doesn't
- **THEN** `polished` ends with the draft's line break

### Requirement: Safety checks
Before replying, the service SHALL verify that every protected token in the draft appears unchanged in the corrected text: `$(...)` substitution fields, URLs, email addresses, and runs containing digits (Western or Arabic-Indic). It MUST also verify that the corrected length is within 70%–130% of the draft's. If either check fails, the reply MUST carry `polished` equal to the draft, `changed: false`, and a `reason`.

#### Scenario: Substitution field preserved
- **WHEN** the draft contains "$(user.firstName)" and the model output changes it
- **THEN** the reply returns the draft unchanged with a reason

#### Scenario: Rewrite rejected
- **WHEN** the model output is less than 70% or more than 130% of the draft's length
- **THEN** the reply returns the draft unchanged with a reason

### Requirement: Failure behavior
The polish endpoint SHALL answer HTTP 503 when no model is configured, 502 on model failure, and 504 on timeout, with sanitized reasons that never include the API key.

#### Scenario: No key
- **WHEN** the server runs without a model
- **THEN** `POST /v1/polish` answers 503
