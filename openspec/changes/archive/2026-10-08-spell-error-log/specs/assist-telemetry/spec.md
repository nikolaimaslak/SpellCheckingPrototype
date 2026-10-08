## MODIFIED Requirements

### Requirement: Event batching
The client SHALL queue assistance events (completion shown, accepted and dismissed; spelling flag, unresolved word, auto-correct, revert, accepted suggestion, ignore; polish shown, accepted, dismissed and reverted) and send them in batches to the configured telemetry endpoint, at least every 5 seconds and when the page is hidden. Telemetry failures MUST NOT affect the composer, and unsent events MAY be dropped.

#### Scenario: Batch sent
- **WHEN** three events occur within 5 seconds
- **THEN** one batch with the three events is posted

#### Scenario: Endpoint down
- **WHEN** the telemetry endpoint is unreachable
- **THEN** typing, spell checking, completion and polish keep working, and no error is shown to the agent

### Requirement: What is recorded
Each stored event SHALL carry its type, timestamp, language, and session identifier, plus latency and lengths for completion events, latency and change count for polish events, and the original and replacement word for spelling events (`flag`, `unresolved`, `autocorrect`, `revert`, `accept`, `ignore`), plus `rank` and `offered` for `accept` events. Events MUST NOT contain completion text, draft or corrected text, transcript text or the composer's content. A `completion-withheld` event, recorded by the completion service or sent by the client, carries only the reason (`format` for model output the server couldn't use; `figure`, `date`, `identifier` and `conversation`, accepted for older logs from the removed safety filter; or `spelling`, accepted for a client-side word check although no client currently sends it), the language and the timestamp; any other reason value MUST be dropped.

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
- **WHEN** the completion service withholds a model reply that has no string `continuation`
- **THEN** the log gains a `completion-withheld` event with reason `format`, and no model output or prefix text

#### Scenario: Flag event stored
- **WHEN** a `flag` event for the English word "chek" is posted with extra fields such as the message text
- **THEN** the stored line holds the type, timestamp, language, session and the word, and no other text

#### Scenario: Unresolved word stored
- **WHEN** an `unresolved` event for "Absher" is posted with extra fields such as the message text
- **THEN** the stored line holds the type, timestamp, language, session and the word, and nothing else

#### Scenario: Accept rank stored
- **WHEN** an `accept` event with `rank: 2` and `offered: 4` is posted
- **THEN** both numbers are stored with the original and replacement words

## ADDED Requirements

### Requirement: Spelling error report
`npm run telemetry:spelling` SHALL write a spelling error report from the event log to `telemetry/spelling-report.md` and `.json`, and `/summary` SHALL show its candidate lists. Optional `--min-sessions` (default 3) sets the threshold.

For each language, the report MUST list every recorded error word, with:
- the counts of `flag`, `accept`, `unresolved`, `ignore`, `autocorrect` and `revert` events;
- the number of distinct sessions;
- the replacements chosen from suggestions, with their counts.

Error words are the `original` of those events.

From these, it MUST derive three candidate lists. Each list is sorted by sessions, then by count, and only includes words seen in at least `--min-sessions` sessions:
- **custom dictionary candidates:** words left misspelled (`unresolved` or `ignore`) in at least `--min-sessions` sessions, whose accepts are under 20% of their flags;
- **misspellings list candidates:** typed words accepted in at least `--min-sessions` sessions, whose most common replacement is at least 80% of their accepts. Each is shown with its error type from the shared taxonomy;
- **removal candidates:** auto-correction pairs whose reverts are at least 30% of their auto-corrections.

The report MUST NOT add anything to any list, and MUST state that every candidate needs human review.

#### Scenario: English custom dictionary candidate
- **WHEN** "Absher" is flagged and left unresolved in 5 sessions, and never accepted
- **THEN** it's a custom dictionary candidate with 5 sessions, 5 flags, 5 left and 0 accepts

#### Scenario: Arabic misspellings candidate
- **WHEN** "الطلبب" is flagged and accepted as "الطلب" in 4 sessions, with no other replacement
- **THEN** it's a misspellings list candidate "الطلبب" → "الطلب", type `insert`

#### Scenario: Removal candidate
- **WHEN** the auto-correction "Saud" → "Sand" happened in 4 sessions and was reverted in 2
- **THEN** it's a removal candidate with a 50% revert rate

#### Scenario: Below the session threshold
- **WHEN** a word was flagged 10 times in one session
- **THEN** it's in the full word list but in no candidate list

#### Scenario: Mixed languages kept apart
- **WHEN** the log has English and Arabic errors
- **THEN** each language has its own word list and candidate lists
