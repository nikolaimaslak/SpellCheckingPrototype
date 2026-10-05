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
- for cases 2 and 3, the word has at least 4 letters (English) or 3 letters (Arabic).

Any misspelled word that doesn't qualify MUST stay suggest-only (underlined, with suggestions in the popover). The same word, dictionaries, list, custom dictionary and confidence level MUST always produce the same decision, regardless of machine load or timing. The decision MUST be made in the browser without network access.

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

## ADDED Requirements

### Requirement: Known misspellings lead the suggestions
When a flagged word is on the misspellings list, the popover SHALL offer the list's fix first, followed by the engine's other suggestions without duplicates. This SHALL apply in both `suggest` and `auto` mode, and MUST work without network access.

#### Scenario: Suggest mode
- **WHEN** the mode is `suggest` and the agent opens the popover on "teh"
- **THEN** "the" is the first suggestion

#### Scenario: Arabic known misspelling not yet replaced
- **WHEN** the mode is `suggest` and the agent opens the popover on "الى"
- **THEN** "إلى" is the first suggestion, and the popover reads right to left
