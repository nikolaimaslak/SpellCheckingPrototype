## MODIFIED Requirements

### Requirement: Summary page
The service SHALL serve a summary at `GET /summary` showing, for the logged events:
- completion acceptance rate (accepted ÷ shown);
- completion latency p50 and p95;
- auto-correct revert rate (reverts ÷ auto-corrections), overall and per language;
- suggestion accepts and ignores per language;
- ignore share (ignores ÷ (accepts + ignores)) per language;
- polish acceptance rate (accepted ÷ shown with changes);
- polish latency p50;
- counts per event type and language;
- the number of withheld completions per reason, next to the number shown.

**Error types:** it SHALL also classify each `autocorrect` and `accept` event's original→replacement pair with the shared error-type taxonomy, and show per language:
- the distribution of error types seen in the field;
- the revert rate per auto-correction type.

**Labels:** each spelling figure MUST be labelled with the offline benchmark metric it approximates:
- revert rate: auto-replace precision;
- ignore share: the false-flag rate;
- the field type distribution: the benchmark's error-type distribution.

**One taxonomy in two languages:** the service's classifier MUST give the same type as the spelling benchmark's classifier for every pair. A shared fixture of English, Arabic and unclassifiable pairs with their expected types MUST be checked against both classifiers in the test suite.

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

#### Scenario: Classifiers agree
- **WHEN** the shared fixture holds "teh"→"the" (en), "المساعده"→"المساعدة" (ar), "xyz"→"abcdef" (en, several edits) and "file"→"ملف" (mixed scripts)
- **THEN** the service's classifier and the spelling benchmark's classifier both give `transpose`, `ta-marbuta`, `multi` and no type, and a fixture entry that either one gets wrong fails the tests

#### Scenario: Existing log read unchanged
- **WHEN** the service starts on a `telemetry/events.jsonl` written by the previous server
- **THEN** the summary counts every event in it as before
