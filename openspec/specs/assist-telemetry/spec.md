# assist-telemetry Specification

## Purpose

Collects composer-assistance events so completion and auto-correct can be tuned and their value judged, and summarizes them for review. The data recorded is kept free of conversation text.

## Requirements

### Requirement: Event batching
The client SHALL queue assistance events (completion shown, accepted and dismissed; auto-correct, revert, accepted suggestion, ignore; polish shown, accepted, dismissed and reverted) and send them in batches to the configured telemetry endpoint, at least every 5 seconds and when the page is hidden. Telemetry failures MUST NOT affect the composer, and unsent events MAY be dropped.

#### Scenario: Batch sent
- **WHEN** three events occur within 5 seconds
- **THEN** one batch with the three events is posted

#### Scenario: Endpoint down
- **WHEN** the telemetry endpoint is unreachable
- **THEN** typing, spell checking, completion and polish keep working, and no error is shown to the agent

### Requirement: What is recorded
Each stored event SHALL carry its type, timestamp, language, and session identifier, plus latency and lengths for completion events, latency and change count for polish events, and the original and replacement word for spelling events. Events MUST NOT contain completion text, draft or corrected text, transcript text or the composer's content.

#### Scenario: Completion event has no text
- **WHEN** a `completion-accepted` event is stored
- **THEN** it contains latency and lengths, and no completion or composer text

#### Scenario: Polish event has no text
- **WHEN** a `polish-shown` event is stored
- **THEN** it contains latency and the change count, and no draft or corrected text

### Requirement: Event log
The service SHALL accept event batches at `POST /v1/events` and append each event as one JSON line to a local log file that is excluded from version control.

#### Scenario: Append
- **WHEN** a batch of two events is posted
- **THEN** two lines are appended to the log

### Requirement: Summary page
The service SHALL serve a summary at `GET /summary` showing, for the logged events: completion acceptance rate (accepted ÷ shown), completion latency p50 and p95, auto-correct revert rate (reverts ÷ auto-corrections), polish acceptance rate (accepted ÷ shown with changes), polish latency p50, and counts per event type and language.

#### Scenario: Rates computed
- **WHEN** the log has 10 completions shown with 4 accepted, and 5 auto-corrections with 1 revert
- **THEN** the summary shows 40% completion acceptance and a 20% revert rate

#### Scenario: Polish rate
- **WHEN** the log has 4 polish previews with changes and 3 accepted
- **THEN** the summary shows 75% polish acceptance
