# assist-telemetry Specification

## Purpose

Collects composer-assistance events so completion and auto-correct can be tuned and their value judged, and summarizes them for review. The data recorded is kept free of conversation text.

## Requirements

### Requirement: Event batching
The client SHALL queue assistance events (completion shown, accepted and dismissed; auto-correct, revert, accepted suggestion, ignore) and send them in batches to the configured telemetry endpoint, at least every 5 seconds and when the page is hidden. Telemetry failures MUST NOT affect the composer, and unsent events MAY be dropped.

#### Scenario: Batch sent
- **WHEN** three events occur within 5 seconds
- **THEN** one batch with the three events is posted

#### Scenario: Endpoint down
- **WHEN** the telemetry endpoint is unreachable
- **THEN** typing, spell checking and completion keep working, and no error is shown to the agent

### Requirement: What is recorded
Each stored event SHALL carry its type, timestamp, language, and session identifier, plus latency and lengths for completion events, and the original and replacement word for spelling events. Events MUST NOT contain completion text, transcript text or the composer's content.

#### Scenario: Completion event has no text
- **WHEN** a `completion-accepted` event is stored
- **THEN** it contains latency and lengths, and no completion or composer text

### Requirement: Event log
The service SHALL accept event batches at `POST /v1/events` and append each event as one JSON line to a local log file that is excluded from version control.

#### Scenario: Append
- **WHEN** a batch of two events is posted
- **THEN** two lines are appended to the log

### Requirement: Summary page
The service SHALL serve a summary at `GET /summary` showing, for the logged events: completion acceptance rate (accepted ÷ shown), completion latency p50 and p95, auto-correct revert rate (reverts ÷ auto-corrections), and counts per event type and language.

#### Scenario: Rates computed
- **WHEN** the log has 10 completions shown with 4 accepted, and 5 auto-corrections with 1 revert
- **THEN** the summary shows 40% completion acceptance and a 20% revert rate
