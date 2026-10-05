## ADDED Requirements

### Requirement: One-edit neighbors request
The worker SHALL answer a neighbors request for a word and a language. The reply lists every word the loaded dictionary accepts, custom words included, that is exactly one edit away from the given word. An edit is one insertion, deletion, substitution, or swap of two adjacent letters, using the letters the dictionary declares for suggestions plus the word's own letters, never a space or hyphen.

For Arabic, the word MUST be compared after removing diacritics and tatweel. For English, the word MUST be compared in lower case. If it starts with a capital letter, a variant also counts when only its capitalized form is accepted (as for proper nouns).

The reply MUST be complete and deterministic: no time limit may cut it short, and the same word, dictionary and custom words MUST always produce the same list in the same order. It MUST carry the request id, MUST be computed offline in the worker, and MUST return an error naming the language when that language is not loaded.

#### Scenario: Two English neighbors
- **WHEN** the page asks for the English neighbors of "recieve"
- **THEN** the reply carries the request id and lists exactly "receive" and "relieve"

#### Scenario: One English neighbor
- **WHEN** the page asks for the English neighbors of "seperate"
- **THEN** the reply lists only "separate"

#### Scenario: Arabic neighbors
- **WHEN** the page asks for the Arabic neighbors of "المستخذم"
- **THEN** the reply lists only "المستخدم"

#### Scenario: Arabic word with many neighbors
- **WHEN** the page asks for the Arabic neighbors of "النضام"
- **THEN** the reply lists more than one word

#### Scenario: Diacritics ignored
- **WHEN** the page asks for the Arabic neighbors of "المُستخذم" (with a damma)
- **THEN** the reply is the same as for "المستخذم"

#### Scenario: Stable under load
- **WHEN** the same neighbors request is sent while other threads keep the CPU busy
- **THEN** the reply is identical to the reply on an idle machine

#### Scenario: Unloaded language
- **WHEN** a neighbors request names a language that is not loaded
- **THEN** the reply is an error naming that language, and the worker keeps serving other requests

#### Scenario: No network
- **WHEN** the worker has reported ready and the network then goes away
- **THEN** neighbors requests keep returning results
