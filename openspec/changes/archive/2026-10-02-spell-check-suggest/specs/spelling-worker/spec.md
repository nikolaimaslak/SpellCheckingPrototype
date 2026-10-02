# Spec Delta

## ADDED Requirements

### Requirement: Batch check
The worker SHALL accept a batch check request with a list of words per language, and reply with which of those words are misspelled. The reply MUST carry the request id. A batch MUST be answered offline, with no network access.

#### Scenario: Mixed batch
- **WHEN** the page sends one batch with English ["receive", "recieve"] and Arabic ["مرحبا"]
- **THEN** the reply carries the same id and lists only "recieve" as misspelled

#### Scenario: Batch with an unloaded language
- **WHEN** a batch includes words for a language that is not loaded
- **THEN** those words are reported as unchecked (neither correct nor misspelled), and the loaded languages' words are still answered
