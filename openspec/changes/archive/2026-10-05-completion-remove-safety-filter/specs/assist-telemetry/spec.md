## MODIFIED Requirements

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
