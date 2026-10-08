## MODIFIED Requirements

### Requirement: Assistance events
The layer SHALL report each auto-correction, revert, accepted suggestion and ignore to an optional callback, with the event type, language, original word and replacement where applicable. It MUST NOT store or transmit these events itself.

**Flags:** it SHALL also report a `flag` event, with the language and the word, the first time a word is underlined in a message. The same word underlined again in that message (after an edit elsewhere, or a recheck) MUST NOT be reported again. Once the composer is emptied (the message was sent or cleared), it is reported again when flagged in the next message. A word auto-replaced without ever being underlined produces only its `autocorrect` event, so every detected error is reported exactly once per message as either `flag` or `autocorrect`.

**Words left misspelled:** when the composer's text becomes empty (the message was sent, or the agent cleared it), the layer SHALL report an `unresolved` event, with the language and the word, for every word that was still underlined in the last check before it emptied, once per word per message. A word fixed from the popover, ignored, auto-corrected, or changed by typing so that it's no longer underlined MUST NOT be reported.

**Accepted suggestions:** an `accept` event SHALL also carry `rank`, the chosen suggestion's 1-based position in the list shown, and `offered`, the number of suggestions shown.

#### Scenario: Auto-correct then revert
- **WHEN** a word is auto-corrected and then reverted
- **THEN** the callback receives an `autocorrect` event followed by a `revert` event for the same word

#### Scenario: No callback
- **WHEN** no callback is provided
- **THEN** auto-correct works the same, and nothing is recorded anywhere

#### Scenario: English flag reported once per message
- **WHEN** the agent types "please chek the form " and later edits another word of the same message
- **THEN** the callback receives one `flag` event for "chek" (language `en`), not one per recheck

#### Scenario: Arabic flag
- **WHEN** the agent types an Arabic word the engine flags, such as "النضام " in suggest mode
- **THEN** the callback receives a `flag` event with language `ar` and the word "النضام"

#### Scenario: Flag again in the next message
- **WHEN** "chek" was flagged, the message is sent, and "chek" is typed in the next message
- **THEN** a second `flag` event is reported

#### Scenario: Accept carries rank and offered
- **WHEN** the popover offers 4 suggestions and the agent picks the second
- **THEN** the `accept` event carries `rank: 2` and `offered: 4`

#### Scenario: English word left misspelled
- **WHEN** "chek" is underlined in "please chek the form " and the message is sent
- **THEN** the callback receives an `unresolved` event with language `en` and the word "chek"

#### Scenario: Arabic word left misspelled
- **WHEN** "النضام" is underlined and the composer is emptied
- **THEN** the callback receives an `unresolved` event with language `ar` and the word "النضام"

#### Scenario: Corrected or ignored words aren't left
- **WHEN** one underlined word is fixed from the popover, one is ignored, one is retyped correctly, and the message is then sent
- **THEN** no `unresolved` event is reported for any of them

#### Scenario: Mixed message
- **WHEN** a message holds the flagged words "chek" and "الطلبب"
- **THEN** one `flag` event is reported for each, with languages `en` and `ar`
