# auto-correct Specification

## Purpose

Automatically fixes clear spelling slips while the agent composes, and only those, in Arabic and English. Every change stays visible and revertible, and nothing that is about to be sent is ever altered. Runs in the browser without network access.

## Requirements

### Requirement: Confidence decision
In `auto` mode, a misspelled word SHALL be auto-replaced only in one of these cases, checked in this order:

1. **Known misspelling.** The word is on the misspellings list of its language. The replacement is the list's fix. This applies whatever the word's length and however many dictionary words are one edit away.
2. **Case-only fix (Latin script).** Keeping the word's first letter as typed and lowercasing the rest gives a correctly spelled word. The replacement is that word, and no other word may be chosen for it.
3. **Single dictionary neighbor.** Exactly one dictionary word, counting the custom dictionary, is a single edit away from the word. An edit is one insertion, deletion, substitution, or swap of two adjacent letters. Distance is counted after removing Arabic diacritics and tatweel, and ignoring letter case. Every dictionary word at that distance counts, not only the engine's suggestions. Variants that would add a space or hyphen are not considered. That one word must also start with the same letter as the misspelled word, where the Arabic alef forms ا أ إ آ count as the same letter for this test only.

Cases 2 and 3 apply only when the admin's auto-replace confidence is `list-and-rule` (the default). At `list`, only case 1 applies.

If the misspelled word starts with a capital letter, the replacement starts with one too. In every case, all of these MUST also hold:
- the word is not written entirely in capitals;
- the word is not on the session ignore list and not in the custom dictionary;
- the word does not start with a capital letter unless it starts a sentence. A sentence starts at the beginning of the text, after a line break, or after `.` `!` `?` `؟` followed by whitespace. A full stop after a common honorific or abbreviation (Mr, Mrs, Ms, Dr, Prof, Eng, St, e.g., i.e., etc.) does not end a sentence;
- the word does not appear in the conversation the host passed (the customer's messages so far), compared ignoring letter case and, for Arabic, diacritics and tatweel;
- for cases 2 and 3, the word has at least 4 letters (English) or 3 letters (Arabic).

Any misspelled word that doesn't qualify MUST stay suggest-only (underlined, with suggestions in the popover). The same word, position in the sentence, conversation, dictionaries, list, custom dictionary and confidence level MUST always produce the same decision, regardless of machine load or timing. The decision MUST be made in the browser without network access.

#### Scenario: Clear English slip
- **WHEN** the agent types "please seperate " in `auto` mode
- **THEN** "seperate" becomes "separate"

#### Scenario: Known short misspelling
- **WHEN** the agent types "teh " in `auto` mode
- **THEN** it becomes "the", although "teh" is short and several words are one edit away

#### Scenario: Known misspelling at the start of a sentence
- **WHEN** the agent types "Teh " in `auto` mode
- **THEN** it becomes "The"

#### Scenario: Known misspelling in capitals
- **WHEN** the agent types "TEH " in `auto` mode
- **THEN** it is not replaced, because all-caps words are left alone

#### Scenario: Ambiguous English slip stays a suggestion
- **WHEN** the agent types "afte " in `auto` mode ("after", "aft", "ate", "fate" and "ante" are all one edit away, and "afte" is not on the list)
- **THEN** the text is unchanged and "afte" is underlined

#### Scenario: Clear Arabic slip
- **WHEN** the agent types "المستخذم " in `auto` mode
- **THEN** it becomes "المستخدم"

#### Scenario: Doubled Arabic letter
- **WHEN** the agent types "حتىى " in `auto` mode
- **THEN** it becomes "حتى"

#### Scenario: Arabic word with many neighbors stays a suggestion
- **WHEN** the agent types "النضام " in `auto` mode (several Arabic dictionary words are one edit away, and it is not on the list)
- **THEN** the text is unchanged, "النضام" is underlined, and its popover offers "النظام"

#### Scenario: Missing hamza on a short Arabic word
- **WHEN** the agent types "اذا كان" in `auto` mode, and the space after "اذا" is the boundary
- **THEN** "اذا" becomes "إذا" (a known misspelling)

#### Scenario: Known Arabic misspelling
- **WHEN** the agent types "سنرسل الرد الى بريدك " in `auto` mode
- **THEN** "الى" becomes "إلى"

#### Scenario: Ambiguous Arabic slip stays a suggestion
- **WHEN** the agent types "ان " in `auto` mode ("أن" and "إن" are both words, so it is not on the list)
- **THEN** the text is unchanged and the word is underlined

#### Scenario: Short or capitalized words are left alone
- **WHEN** the agent types "tge " or "GOSSI " in `auto` mode (neither is on the list)
- **THEN** neither is replaced; both are underlined as suggestions

#### Scenario: Capitalization preserved
- **WHEN** the agent types "Seperate " at the start of a sentence in `auto` mode
- **THEN** it becomes "Separate"

#### Scenario: Stray capital fixes the case only
- **WHEN** the agent types "oNly ", "thiS " or "dOcument " in `auto` mode
- **THEN** they become "only", "this" and "document", never "oily", "thin" or "documents"

#### Scenario: List-only confidence
- **WHEN** the admin's auto-replace confidence is `list`, and the agent types "teh paymnet المستخذم " in `auto` mode
- **THEN** "teh" becomes "the", while "paymnet" and "المستخذم" (not on the list) are not replaced and are underlined

#### Scenario: Reverted known misspelling
- **WHEN** "teh" was auto-corrected to "the" and the agent reverts it
- **THEN** typing "teh " again in the same session leaves it unchanged

#### Scenario: Same decision under CPU load
- **WHEN** the agent types "afte ", "teh " and "الإلكطروني " in `auto` mode on a heavily loaded machine
- **THEN** "afte" is unchanged, "teh" becomes "the" and "الإلكطروني" becomes "الإلكتروني", as on an idle machine

#### Scenario: Mixed sentence
- **WHEN** the agent types "رقم المستخذم هو paymnet " in `auto` mode
- **THEN** "المستخذم" becomes "المستخدم" and "paymnet" becomes "payment", each checked in its own language

#### Scenario: No network
- **WHEN** the network is unavailable after the dictionaries have loaded, and the agent types "please seperate " and "teh " in `auto` mode
- **THEN** "seperate" becomes "separate" and "teh" becomes "the"

#### Scenario: Name after an honorific
- **WHEN** the agent types "Dear Ms. Fatimah, " in `auto` mode
- **THEN** "Fatimah" is not replaced (a capital in mid-sentence); it may be underlined

#### Scenario: Name in a compound
- **WHEN** the agent types "Dear Mr. Al-Harbi, " in `auto` mode
- **THEN** "Harbi" is not replaced

#### Scenario: Capitalized typo at the start of a sentence is still fixed
- **WHEN** the agent types "Thanks. Seperate forms are needed. " in `auto` mode
- **THEN** "Seperate" becomes "Separate", because it starts a sentence

#### Scenario: Name from the conversation at the start of a sentence
- **WHEN** the customer wrote "Hello, this is Noura" and the agent types "Noura, thank you " in `auto` mode
- **THEN** "Noura" is not replaced

#### Scenario: Arabic name from the conversation
- **WHEN** the customer wrote "معك نوره من الرياض" and the agent types "شكراً نوره، " in `auto` mode
- **THEN** "نوره" is not replaced

#### Scenario: Mixed message with a conversation word
- **WHEN** the customer wrote "my employer is Almarai" and the agent types "تم تحديث بيانات Almarai والنضام " in `auto` mode
- **THEN** "Almarai" is not replaced, and the Arabic words are decided as usual

#### Scenario: No conversation passed
- **WHEN** the host passes no conversation and the agent types "Noura, thank you " in `auto` mode
- **THEN** "Noura" is decided by the other rules, as it starts a sentence

#### Scenario: Conversation words stay offline
- **WHEN** the network is unavailable and the customer's messages are in the transcript
- **THEN** the conversation guard still applies, and the conversation is never sent anywhere by the layer

### Requirement: Only a typed boundary triggers auto-correct
Auto-replacement SHALL be considered only for the word immediately before a single boundary character the agent just typed: whitespace, punctuation (including Arabic ، ؛ ؟), a line break, or a new paragraph.

If that boundary is `.`, `@`, `:` or `/`, characters that also occur inside email addresses and URLs, the word MUST be held, not decided at once. A held word SHALL be decided when the agent next types whitespace, a line break or a new paragraph, provided no whitespace was typed between the word and that point. It is then decided only if it is still unchanged and still a checkable word in the text typed so far (not part of an excluded span such as an email address or URL). A held word MUST be dropped if the agent types or moves elsewhere and the condition can no longer be met.

Auto-correct MUST NOT fire on Enter-to-send, on paste, on text inserted by the host (predefined messages, emoji), when the caret moves away by click or arrow keys, at the end of IME composition, or for any word other than the one just completed or held. It MUST work without network access.

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

#### Scenario: Email address typed by hand
- **WHEN** the agent types "email info@gosi.gov.sa " in `auto` mode
- **THEN** no part of the address is replaced at any point while typing ("gosi" never becomes "gosh")

#### Scenario: URL typed by hand
- **WHEN** the agent types "visit https://www.gosi.gov.sa/en " in `auto` mode
- **THEN** no part of the URL is replaced at any point while typing ("https" never becomes "HTTP")

#### Scenario: Email address in an Arabic sentence
- **WHEN** the agent types "راسلنا على info@gosi.gov.sa " in `auto` mode
- **THEN** the text is unchanged

#### Scenario: Word before a full stop is corrected at the next space
- **WHEN** the agent types "please seperate. " in `auto` mode
- **THEN** after the "." the word is still "seperate", and after the space it is "separate"

#### Scenario: Arabic word before a full stop
- **WHEN** the agent types "رقم المستخذم. " in `auto` mode
- **THEN** "المستخذم" becomes "المستخدم" when the space is typed

#### Scenario: Comma still decides at once
- **WHEN** the agent types "please seperate," in `auto` mode
- **THEN** "seperate" becomes "separate" as soon as the comma is typed

#### Scenario: Full stop then Enter sends as typed
- **WHEN** the agent types "please seperate." and presses Enter in the chat composer, sending the message
- **THEN** the message is sent as typed

#### Scenario: Full stop then Shift+Enter
- **WHEN** the agent types "please seperate." and then presses Shift+Enter
- **THEN** "seperate" becomes "separate" and the line break is kept

#### Scenario: Held word dropped when the agent types elsewhere
- **WHEN** the agent types "please seperate.", clicks at the start of the message, and types a space there
- **THEN** "seperate" is not replaced; it is underlined once settled

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
The agent SHALL be able to revert an auto-replacement in three ways:
- with one Undo;
- by clicking the corrected word and choosing "Revert to *original*" in the popover;
- by pressing Backspace right after the correction. That's when Backspace (without modifiers) is the next key after the correction was applied, the correction still stands, and only the boundary characters that triggered it lie between the corrected word and the caret.

A Backspace revert MUST restore the original word, keep the boundary characters and the caret position after them, form one undo step, and not reach the host as a key press. In any other situation, Backspace MUST behave as the host normally handles it.

A reverted word MUST be added to the **session** ignore list, so it is neither corrected again nor underlined for the rest of the session. This deliberately exceeds Req 4.2.1's "not in the same message". It MUST work without network access.

#### Scenario: Undo reverts
- **WHEN** "seperate" was auto-corrected to "separate" and the agent presses Undo once
- **THEN** the text shows "seperate" again, and typing further boundaries does not correct it again

#### Scenario: Revert from the popover
- **WHEN** the agent clicks the auto-corrected "المستخدم" and chooses "Revert to المستخذم"
- **THEN** the original word is restored with a single undoable change, and it is not underlined or corrected again this session

#### Scenario: Revert offered only while the correction stands
- **WHEN** the agent has since edited the corrected word
- **THEN** the popover for it no longer offers "Revert"

#### Scenario: Backspace right after reverts
- **WHEN** the agent types "please seperate " in `auto` mode, it becomes "please separate ", and the agent then presses Backspace
- **THEN** the text is "please seperate " with the caret after the space, one Undo brings back "please separate ", and "seperate" is not corrected again this session

#### Scenario: Backspace reverts an Arabic correction
- **WHEN** the agent types "رقم المستخذم " in `auto` mode, it becomes "رقم المستخدم ", and the agent then presses Backspace
- **THEN** the text is "رقم المستخذم "

#### Scenario: Backspace after typing more deletes normally
- **WHEN** "seperate" was corrected to "separate" after the agent had already typed "separate t", and the agent presses Backspace
- **THEN** the "t" is deleted, and the correction stays

#### Scenario: Backspace later deletes normally
- **WHEN** the agent typed more text after a correction, deleted it again, and then presses Backspace with the caret after the boundary
- **THEN** Backspace deletes the boundary character as usual, because it was not the next key after the correction

#### Scenario: Ctrl+Backspace is not a revert
- **WHEN** a correction just landed and the agent presses Ctrl+Backspace
- **THEN** the host deletes as usual, and the correction is not reverted

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

### Requirement: Known misspellings lead the suggestions
When a flagged word is on the misspellings list, the popover SHALL offer the list's fix first, followed by the engine's other suggestions without duplicates. This SHALL apply in both `suggest` and `auto` mode, and MUST work without network access.

#### Scenario: Suggest mode
- **WHEN** the mode is `suggest` and the agent opens the popover on "teh"
- **THEN** "the" is the first suggestion

#### Scenario: Arabic known misspelling not yet replaced
- **WHEN** the mode is `suggest` and the agent opens the popover on "الى"
- **THEN** "إلى" is the first suggestion, and the popover reads right to left
