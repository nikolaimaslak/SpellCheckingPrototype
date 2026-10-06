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
Each stored event SHALL carry its type, timestamp, language, and session identifier, plus latency and lengths for completion events, latency and change count for polish events, and the original and replacement word for spelling events. Events MUST NOT contain completion text, draft or corrected text, transcript text or the composer's content. A `completion-withheld` event, recorded by the completion service or sent by the client, carries only the reason (`format` for model output the server couldn't use; `figure`, `date`, `identifier` and `conversation`, accepted for older logs from the removed safety filter; or `spelling`, accepted for a client-side word check although no client currently sends it), the language and the timestamp; any other reason value MUST be dropped.

#### Scenario: Completion event has no text
- **WHEN** a `completion-accepted` event is stored
- **THEN** it contains latency and lengths, and no completion or composer text

#### Scenario: Polish event has no text
- **WHEN** a `polish-shown` event is stored
- **THEN** it contains latency and the change count, and no draft or corrected text

#### Scenario: Withheld completion recorded without text
- **WHEN** an older log line holds a `completion-withheld` event with reason `figure`
- **THEN** it is kept and counted, carries no completion, prefix or transcript text, and the completion service writes no new `figure` events

#### Scenario: Client word check recorded without text
- **WHEN** the client withholds a suggestion because its first word is misspelled
- **THEN** the log gains a `completion-withheld` event with reason `spelling`, and no suggestion or composer text

#### Scenario: Malformed model output recorded without text
- **WHEN** the completion service withholds a model reply whose `word` doesn't extend what the agent typed
- **THEN** the log gains a `completion-withheld` event with reason `format`, and no model output or prefix text

### Requirement: Event log
The service SHALL accept event batches at `POST /v1/events` and append each event as one JSON line to a local log file that is excluded from version control.

#### Scenario: Append
- **WHEN** a batch of two events is posted
- **THEN** two lines are appended to the log

### Requirement: Summary page
The service SHALL serve a summary at `GET /summary` showing, for the logged events: completion acceptance rate (accepted ÷ shown), completion latency p50 and p95, auto-correct revert rate (reverts ÷ auto-corrections) overall and per language, suggestion accepts and ignores per language, ignore share (ignores ÷ (accepts + ignores)) per language, polish acceptance rate (accepted ÷ shown with changes), polish latency p50, counts per event type and language, and the number of withheld completions per reason, next to the number shown. It SHALL also classify each `autocorrect` and `accept` event's original→replacement pair with the shared error-type taxonomy, and show per language the distribution of error types seen in the field and the revert rate per auto-correction type. Each spelling figure MUST be labelled with the offline benchmark metric it approximates: revert rate with auto-replace precision, ignore share with the false-flag rate, and the field type distribution with the benchmark's error-type distribution.

#### Scenario: Rates computed
- **WHEN** the log has 10 completions shown with 4 accepted, and 5 auto-corrections with 1 revert
- **THEN** the summary shows 40% completion acceptance and a 20% revert rate

#### Scenario: Polish rate
- **WHEN** the log has 4 polish previews with changes and 3 accepted
- **THEN** the summary shows 75% polish acceptance

#### Scenario: Revert rate per language
- **WHEN** the log has 4 English auto-corrections with no revert, and 4 Arabic auto-corrections with 2 reverts
- **THEN** the summary shows a 0% English and a 50% Arabic revert rate, next to 25% overall

#### Scenario: Ignore share
- **WHEN** the log has 6 Arabic suggestion accepts and 2 Arabic ignores
- **THEN** the summary shows a 25% Arabic ignore share, labelled as the field proxy for the false-flag rate

#### Scenario: Field error types
- **WHEN** the log has Arabic accepts "اذا"→"إذا" and "المساعده"→"المساعدة", and an Arabic auto-correction "النضام"→"النظام" that was reverted
- **THEN** the Arabic error-type distribution shows one `hamza`, one `ta-marbuta` and one `emphatic`, and the `emphatic` auto-correction revert rate is 100%

#### Scenario: Withheld completions
- **WHEN** the log has 10 completions shown, 3 withheld for `figure` and 1 for `conversation`
- **THEN** the summary shows withheld counts of 3 `figure` and 1 `conversation` next to 10 shown

#### Scenario: Spelling withholds counted
- **WHEN** the log has 2 completions withheld for `spelling` and 1 for `figure`
- **THEN** the summary shows withheld counts of 2 `spelling` and 1 `figure`

#### Scenario: Format withholds counted
- **WHEN** the log has 4 completions withheld for `format`
- **THEN** the summary shows a withheld count of 4 `format`
