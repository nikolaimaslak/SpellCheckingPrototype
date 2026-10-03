# Spec Delta

## MODIFIED Requirements

### Requirement: Summary page
The service SHALL serve a summary at `GET /summary` showing, for the logged events: completion acceptance rate (accepted ÷ shown), completion latency p50 and p95, auto-correct revert rate (reverts ÷ auto-corrections) overall and per language, suggestion accepts and ignores per language, ignore share (ignores ÷ (accepts + ignores)) per language, polish acceptance rate (accepted ÷ shown with changes), polish latency p50, and counts per event type and language. It SHALL also classify each `autocorrect` and `accept` event's original→replacement pair with the shared error-type taxonomy, and show per language the distribution of error types seen in the field and the revert rate per auto-correction type. Each spelling figure MUST be labelled with the offline benchmark metric it approximates: revert rate with auto-replace precision, ignore share with the false-flag rate, and the field type distribution with the benchmark's error-type distribution.

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
