# Spec Delta

## Purpose

Turns the text of a composer, including rich markup, into the words that spell checking acts on, each tied to its exact on-screen range. It decides which tokens are never checked and which language each word belongs to. Runs entirely in the browser without network access.

## ADDED Requirements

### Requirement: Words with exact ranges
The tokenizer SHALL produce, for a composer's current content, the list of word tokens. Each token carries its text and a range that covers exactly that word in the document. It MUST work offline, with no network access.

#### Scenario: English sentence
- **WHEN** the composer contains "Thank you for contacting us"
- **THEN** the tokens are "Thank", "you", "for", "contacting", "us", each with a range whose text equals the token

#### Scenario: Word split by formatting
- **WHEN** the email composer contains "rec" in bold immediately followed by "eive" in plain text
- **THEN** one token "receive" is produced, with a range spanning both text nodes

#### Scenario: Line breaks, emoji and inline images are boundaries
- **WHEN** the composer contains "hello" then a line break then "world", or "thanks😊please", or a word directly followed by an inline image
- **THEN** each side becomes a separate token, and no token includes the emoji, image or line break

#### Scenario: Contractions stay whole
- **WHEN** the composer contains "don't"
- **THEN** a single token "don't" is produced

### Requirement: Arabic and mixed-script segmentation
The tokenizer SHALL segment Arabic words correctly, including words with attached prefixes and suffixes, diacritics and tatweel, and SHALL handle Arabic and English mixed within one sentence.

#### Scenario: Arabic sentence
- **WHEN** the composer contains "مرحبا، كيف يمكنني مساعدتك؟"
- **THEN** the tokens are "مرحبا", "كيف", "يمكنني", "مساعدتك", and the Arabic comma and question mark are not part of any token

#### Scenario: Attached clitics stay one token
- **WHEN** the composer contains "والكتاب بالمدرسة"
- **THEN** the tokens are "والكتاب" and "بالمدرسة"

#### Scenario: Diacritics and tatweel stay inside the token
- **WHEN** the composer contains "مَرْحَبًا" or "مرحـــبا"
- **THEN** each produces one token whose range covers the full written form

#### Scenario: Mixed sentence
- **WHEN** the composer contains "رقم الطلب في نظام GOSI هو"
- **THEN** "GOSI" is a token tagged English and the other words are tagged Arabic

### Requirement: Per-word language routing
Each token SHALL be tagged with a language by script: Arabic script → Arabic, Latin script → English. A token mixing Arabic and Latin letters MUST be excluded rather than guessed.

#### Scenario: Script decides language
- **WHEN** tokens "hello" and "مرحبا" are produced
- **THEN** they are tagged English and Arabic respectively

#### Scenario: Mixed-script token
- **WHEN** a token contains both Arabic and Latin letters, such as "GOSIنظام"
- **THEN** the token is excluded from checking

### Requirement: Exclusions
The tokenizer SHALL exclude from checking: URLs, email addresses, tokens containing any digit (Western or Arabic-Indic), and Bright Pattern substitution fields of the form `$(...)`. Excluded text MUST NOT produce word tokens from its parts.

#### Scenario: URL and email
- **WHEN** the composer contains "see https://gosi.gov.sa/ar/services or mail info@gosi.gov.sa"
- **THEN** only "see", "or" and "mail" are checkable tokens

#### Scenario: Reference numbers
- **WHEN** the composer contains "case CS-104233 and طلب ١٢٣٤٥"
- **THEN** "CS-104233" and "١٢٣٤٥" are excluded, and "case", "and" and "طلب" are checkable

#### Scenario: Substitution field
- **WHEN** the composer contains "Dear $(user.firstName), welcome"
- **THEN** "Dear" and "welcome" are checkable, and nothing inside `$(user.firstName)` is

### Requirement: Settled words
A token SHALL be reported as settled only when the caret is not inside it and not at its end; otherwise it MUST be reported as pending. Pending tells consumers not to start a new check for that word yet. It does not erase a result already known for the same unchanged text.

#### Scenario: Word being typed
- **WHEN** the agent has typed "recie" and the caret is right after it
- **THEN** the token is pending

#### Scenario: Boundary typed
- **WHEN** the agent types a space after "recieve"
- **THEN** "recieve" becomes settled

#### Scenario: Caret moved back into a word
- **WHEN** the caret is placed in the middle of an earlier word
- **THEN** that word is reported as pending, and every other word stays settled
