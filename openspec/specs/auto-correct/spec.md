# auto-correct Specification

## Purpose

Automatically fixes clear spelling slips while the agent composes, and only those, in Arabic and English. Every change stays visible and revertible, and nothing that is about to be sent is ever altered. Runs in the browser without network access.

## Requirements

### Requirement: Confidence decision
In `auto` mode, a misspelled word SHALL be auto-replaced only if every one of these holds:
- exactly one engine suggestion is a single edit away from the word (one insertion, deletion, substitution, or swap of two adjacent letters), counted after removing Arabic diacritics and tatweel, ignoring letter case, and disregarding suggestions that contain a space or hyphen the word doesn't have;
- the word has at least 4 letters (English) or 3 letters (Arabic);
- the word and the replacement start with the same letter, where the Arabic alef forms ا أ إ آ count as the same letter for this test only;
- the word and the replacement are in the same script;
- the word is not written entirely in capitals, is not on the session ignore list, and is not in the custom dictionary.

Any misspelled word that fails a condition MUST stay suggest-only (underlined). The decision MUST be made in the browser without network access.

#### Scenario: Clear English slip
- **WHEN** the agent types "please seperate " in `auto` mode
- **THEN** "seperate" becomes "separate"

#### Scenario: Ambiguous English slip stays a suggestion
- **WHEN** the agent types "I will recieve " in `auto` mode (both "receive" and "relieve" are one edit away)
- **THEN** the text is unchanged and "recieve" is underlined

#### Scenario: Clear Arabic slip
- **WHEN** the agent types "النضام " in `auto` mode
- **THEN** it becomes "النظام"

#### Scenario: Missing hamza on a short Arabic word
- **WHEN** the agent types "اذا كان" in `auto` mode, and the space after "اذا" is the boundary
- **THEN** "اذا" becomes "إذا"

#### Scenario: Ambiguous Arabic slip stays a suggestion
- **WHEN** the agent types "التامينات " in `auto` mode (several one-edit candidates)
- **THEN** the text is unchanged and the word is underlined

#### Scenario: Short or capitalized words are left alone
- **WHEN** the agent types "teh " or "GOSSI " in `auto` mode
- **THEN** neither is replaced; both are underlined as suggestions

#### Scenario: Capitalization preserved
- **WHEN** the agent types "Seperate " at the start of a sentence in `auto` mode
- **THEN** it becomes "Separate"

#### Scenario: Mixed sentence
- **WHEN** the agent types "رقم النضام هو paymnet " in `auto` mode
- **THEN** "النضام" becomes "النظام" and "paymnet" becomes "payment", each checked in its own language

### Requirement: Only a typed boundary triggers auto-correct
Auto-replacement SHALL be considered only for the word immediately before a single boundary character the agent just typed: whitespace, punctuation (including Arabic ، ؛ ؟), a line break, or a new paragraph. It MUST NOT fire on Enter-to-send, on paste, on text inserted by the host (predefined messages, emoji), when the caret moves away by click or arrow keys, at the end of IME composition, or for any word other than the one just completed.

#### Scenario: Enter sends the typo as typed
- **WHEN** the agent types "please seperate" and presses Enter in the chat composer, sending the message
- **THEN** the message is sent as typed, with no automatic change

#### Scenario: Paste is not auto-corrected
- **WHEN** the agent pastes "please seperate them "
- **THEN** the text is unchanged and "seperate" is underlined

#### Scenario: Predefined message is not auto-corrected
- **WHEN** a predefined message containing a misspelled word is inserted into the composer
- **THEN** its text is unchanged

#### Scenario: Moving the caret away does not trigger it
- **WHEN** the agent types "seperate" and clicks elsewhere in the composer
- **THEN** the word is not replaced; it becomes underlined once settled

### Requirement: Applying an auto-correction
An auto-replacement SHALL go through the same native text-change path as accepted suggestions, so it creates one undo step and the host receives a normal input event. It MUST only apply if the word is still unchanged when the decision arrives. The agent's caret MUST end up where they were typing, shifted only by the length difference. The replacement MUST briefly flash with a visual highlight that is not written into the editable DOM.

#### Scenario: Caret stays where the agent is typing
- **WHEN** the agent types "seperate t" quickly and the replacement lands after the "t"
- **THEN** the text reads "separate t" and the caret is after the "t"

#### Scenario: Word changed before the decision arrived
- **WHEN** the agent edits the word before its auto-correction is applied
- **THEN** no replacement happens

#### Scenario: Message sent before the decision arrived
- **WHEN** the composer is cleared (message sent) before the auto-correction is applied
- **THEN** nothing is inserted

#### Scenario: Flash is not part of the text
- **WHEN** an auto-replacement flashes
- **THEN** the composer HTML contains no extra markup, and the flash disappears after about two seconds

### Requirement: Reverting an auto-correction
The agent SHALL be able to revert an auto-replacement either with one Undo, or by clicking the corrected word and choosing "Revert to *original*" in the popover. A reverted word MUST be added to the session ignore list, so it is neither corrected again nor underlined.

#### Scenario: Undo reverts
- **WHEN** "seperate" was auto-corrected to "separate" and the agent presses Undo once
- **THEN** the text shows "seperate" again, and typing further boundaries does not correct it again

#### Scenario: Revert from the popover
- **WHEN** the agent clicks the auto-corrected "النظام" and chooses "Revert to النضام"
- **THEN** the original word is restored with a single undoable change, and it is not underlined or corrected again this session

#### Scenario: Revert offered only while the correction stands
- **WHEN** the agent has since edited the corrected word
- **THEN** the popover for it no longer offers "Revert"

### Requirement: Assistance events
The layer SHALL report each auto-correction, revert, accepted suggestion and ignore to an optional callback, with the event type, language, original word and replacement where applicable. It MUST NOT store or transmit these events itself.

#### Scenario: Auto-correct then revert
- **WHEN** a word is auto-corrected and then reverted
- **THEN** the callback receives an `autocorrect` event followed by a `revert` event for the same word

#### Scenario: No callback
- **WHEN** no callback is provided
- **THEN** auto-correct works the same, and nothing is recorded anywhere
