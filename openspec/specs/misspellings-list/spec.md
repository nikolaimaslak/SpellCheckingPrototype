# misspellings-list Specification

## Purpose

A maintained list per language of common typing slips, each with exactly one plausible fix. It gives auto-correct its high-confidence cases (formal Req 4.2.3) where the general rule must stay cautious, such as "teh" → "the" and "اذا" → "إذا".

## Requirements

### Requirement: Curated lists per language
The layer SHALL ship one misspellings list for English and one for Arabic. Each entry maps one misspelled word to exactly one fix. The lists MUST be bundled with the page code and used without network access.

- The English list is written for this project. It MUST NOT be copied from a third-party list.
- The Arabic list consists of AyaSpell's whole-word replacements, as declared in the bundled `ar.aff` and used under its MPL 1.1 terms, plus entries written for this project.

Entries are matched as follows:
- **English:** in lower case, against a word typed in lower case or with only its first letter capitalized.
- **Arabic:** after removing diacritics and tatweel.

#### Scenario: English entry
- **WHEN** the English list is loaded
- **THEN** it maps "teh" to "the"

#### Scenario: AyaSpell entry
- **WHEN** the Arabic list is loaded
- **THEN** it maps "اذا" to "إذا" and "الى" to "إلى", each recorded as coming from AyaSpell

#### Scenario: Diacritics ignored when matching
- **WHEN** the agent types "الىٰ" (with a superscript alef)
- **THEN** it matches the list entry for "الى"

#### Scenario: No network
- **WHEN** the network is unavailable
- **THEN** list lookups still work

### Requirement: Entry checks
Every entry SHALL pass these checks, run automatically against the committed engine and dictionaries:
- the misspelled word is rejected and the fix is accepted;
- both are single words in the same script, and they differ;
- an English misspelled word has at least 3 letters;
- the misspelled word is not in the eval datasets' custom dictionary;
- the misspelled word appears only once in its list.

For Arabic, there is an alef-form check. The dictionary's morphology also accepts many spellings that are not plausible fixes, such as "أذا" (the question prefix أ + "ذا"). So the plausibility judgment belongs to a person, and the check makes it explicit and keeps it current:
- Replace any letter of the misspelled word from the set ا أ إ آ with another letter of that set.
- Every word produced this way that the dictionary accepts, apart from the fix, MUST be acknowledged in the entry as not a plausible fix.
- Every acknowledged spelling MUST still be such a word. Stale acknowledgements fail.
- An entry whose alternatives include a plausible fix (for example "ان", where "إن" is as plausible as "أن") MUST NOT be listed.
- Acknowledgements are part of the human review.

An AyaSpell replacement that fails a check MUST be left out, with the reason recorded. Its acknowledgements are kept next to the generated entries, not inside them. A project entry that fails a check MUST fail the test suite.

#### Scenario: Valid word as typo
- **WHEN** a project entry's misspelled word is accepted by the dictionary (for example "امس")
- **THEN** the check fails, naming the entry

#### Scenario: Two hamza forms
- **WHEN** the Arabic list has the entry "ان" → "أن" without acknowledging "إن"
- **THEN** the check fails, naming "إن"

#### Scenario: Acknowledged artifact
- **WHEN** the Arabic list has "اذا" → "إذا" and acknowledges "أذا" and "أذأ" as not plausible
- **THEN** the entry passes

#### Scenario: Stale acknowledgement
- **WHEN** an entry acknowledges a spelling that the dictionary no longer accepts
- **THEN** the check fails, naming the stale acknowledgement

#### Scenario: AyaSpell entry the engine accepts
- **WHEN** AyaSpell's replacement for "انت" is read, and the dictionary accepts "انت" as written
- **THEN** the entry is left out, and the reason is recorded

#### Scenario: Short English entry
- **WHEN** a project entry is "ot" → "to"
- **THEN** the check fails (fewer than 3 letters)

### Requirement: Provenance and review
Each list file SHALL state its source, its license or ownership, and its human review status. The project lists MUST be reviewed by a person before they are used in a tester build, with a fluent Arabic reader for the Arabic list. Until then, the review is tracked as an open known issue.

#### Scenario: Pending review
- **WHEN** the project lists have not been reviewed yet
- **THEN** each file says "human review: pending", and `docs/known-issues.md` lists the open review

#### Scenario: AyaSpell attribution
- **WHEN** a reader looks up where an Arabic entry came from
- **THEN** the AyaSpell entries are identified as derived from `dicts/ar/ar.aff`, under the notice in `dicts/ar/NOTICE`
