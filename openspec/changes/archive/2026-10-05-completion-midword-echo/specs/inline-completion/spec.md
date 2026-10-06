## ADDED Requirements

### Requirement: Suggestion word check
Before showing a suggestion, the client SHALL check the first word it would produce, using the spelling engine already loaded in the page:
- when the suggestion continues the word the agent is typing (the prefix ends in a letter and the suggestion starts with a letter), the word to check is the unfinished word joined with the suggestion's first fragment;
- otherwise, it is the suggestion's first word.

The suggestion MUST NOT be shown when:
- the engine rejects that word; or
- in English, the suggestion's first word is a single letter other than "a" or "I".

Withholding MUST emit a `completion-withheld` event with reason `spelling` and no text. When no spelling engine is ready for the word's language, or no check is available, the suggestion MUST be shown as before. The check MUST never delay or block typing, and it MUST work without network access. If the caret or text changed while the check ran, the suggestion MUST NOT be shown.

#### Scenario: Broken mid-word fragment
- **WHEN** the agent typed "…you could have be" and the suggestion is "n easily confused."
- **THEN** nothing is shown, because "ben" is rejected, and a `completion-withheld` event with reason `spelling` is emitted

#### Scenario: Stray single letter
- **WHEN** the agent typed "…you could have be" and the suggestion is " n easily confused."
- **THEN** nothing is shown, because a lone "n" can't start a new English word

#### Scenario: Correct mid-word completion
- **WHEN** the agent typed "It hasn't been proce" and the suggestion is "ssed yet."
- **THEN** it is shown, because "processed" is accepted

#### Scenario: New word
- **WHEN** the agent typed "Thank you, your request" and the suggestion is " has been received."
- **THEN** it is shown, because "has" is accepted

#### Scenario: Arabic mid-word completion
- **WHEN** the agent typed "تم استلا" and the suggestion is "م طلبك"
- **THEN** it is shown, because "استلام" is accepted

#### Scenario: Arabic broken fragment
- **WHEN** the agent typed "تم استلا" and the suggestion is "ظ طلبك"
- **THEN** nothing is shown, because "استلاظ" is rejected

#### Scenario: Engine not ready
- **WHEN** the spelling engine hasn't loaded the language yet, or spell checking is off
- **THEN** the suggestion is shown without the check

#### Scenario: Text changed during the check
- **WHEN** the agent types another character while the word check is running
- **THEN** the suggestion is not shown
