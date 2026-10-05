## MODIFIED Requirements

### Requirement: Confidence decision
In `auto` mode, a misspelled word SHALL be auto-replaced only in one of these two cases, checked in this order:

1. **Case-only fix (Latin script).** Keeping the word's first letter as typed and lowercasing the rest gives a correctly spelled word. The replacement is that word, and no other word may be chosen for it.
2. **Single dictionary neighbor.** Exactly one dictionary word, counting the custom dictionary, is a single edit away from the word. An edit is one insertion, deletion, substitution, or swap of two adjacent letters. Distance is counted after removing Arabic diacritics and tatweel, and ignoring letter case. Every dictionary word at that distance counts, not only the engine's suggestions. Variants that would add a space or hyphen are not considered. That one word must also start with the same letter as the misspelled word, where the Arabic alef forms ا أ إ آ count as the same letter for this test only. If the misspelled word starts with a capital letter, the replacement starts with one too.

In both cases, all of these MUST also hold:
- the word has at least 4 letters (English) or 3 letters (Arabic);
- the word is not written entirely in capitals;
- the word is not on the session ignore list and not in the custom dictionary.

Any misspelled word that doesn't qualify MUST stay suggest-only (underlined, with the engine's suggestions in the popover). The same word, dictionaries and custom dictionary MUST always produce the same decision, regardless of machine load or timing. The decision MUST be made in the browser without network access.

#### Scenario: Clear English slip
- **WHEN** the agent types "please seperate " in `auto` mode
- **THEN** "seperate" becomes "separate"

#### Scenario: Ambiguous English slip stays a suggestion
- **WHEN** the agent types "I will recieve " in `auto` mode ("receive" and "relieve" are both dictionary words one edit away)
- **THEN** the text is unchanged and "recieve" is underlined

#### Scenario: Clear Arabic slip
- **WHEN** the agent types "المستخذم " in `auto` mode
- **THEN** it becomes "المستخدم"

#### Scenario: Doubled Arabic letter
- **WHEN** the agent types "حتىى " in `auto` mode
- **THEN** it becomes "حتى"

#### Scenario: Arabic word with many neighbors stays a suggestion
- **WHEN** the agent types "النضام " in `auto` mode (several Arabic dictionary words are one edit away)
- **THEN** the text is unchanged, "النضام" is underlined, and its popover offers "النظام"

#### Scenario: Missing hamza on a short Arabic word
- **WHEN** the agent types "اذا كان" in `auto` mode, and the space after "اذا" is the boundary
- **THEN** "اذا" is unchanged and underlined, and its popover offers "إذا" (several Arabic words are one edit away)

#### Scenario: Ambiguous Arabic slip stays a suggestion
- **WHEN** the agent types "التامينات " in `auto` mode (several one-edit candidates)
- **THEN** the text is unchanged and the word is underlined

#### Scenario: Short or capitalized words are left alone
- **WHEN** the agent types "teh " or "GOSSI " in `auto` mode
- **THEN** neither is replaced; both are underlined as suggestions

#### Scenario: Capitalization preserved
- **WHEN** the agent types "Seperate " at the start of a sentence in `auto` mode
- **THEN** it becomes "Separate"

#### Scenario: Stray capital fixes the case only
- **WHEN** the agent types "oNly ", "thiS " or "dOcument " in `auto` mode
- **THEN** they become "only", "this" and "document", never "oily", "thin" or "documents"

#### Scenario: Same decision under CPU load
- **WHEN** the agent types "I will recieve " and "الإلكطروني " in `auto` mode on a heavily loaded machine
- **THEN** "recieve" is unchanged and "الإلكطروني" becomes "الإلكتروني", as on an idle machine

#### Scenario: Mixed sentence
- **WHEN** the agent types "رقم المستخذم هو paymnet " in `auto` mode
- **THEN** "المستخذم" becomes "المستخدم" and "paymnet" becomes "payment", each checked in its own language

#### Scenario: No network
- **WHEN** the network is unavailable after the dictionaries have loaded, and the agent types "please seperate " in `auto` mode
- **THEN** "seperate" becomes "separate"

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
