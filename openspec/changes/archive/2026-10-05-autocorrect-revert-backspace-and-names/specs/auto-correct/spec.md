## MODIFIED Requirements

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
