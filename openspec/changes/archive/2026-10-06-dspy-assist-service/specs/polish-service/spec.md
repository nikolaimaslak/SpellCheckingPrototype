## MODIFIED Requirements

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
