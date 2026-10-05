# spelling-worker Specification

## Purpose

Runs spell checking off the main thread in a Web Worker with a small message protocol, entirely offline, so typing never waits on dictionary loads or suggestion generation.

## Requirements

### Requirement: Offline operation
The worker SHALL run with no network access beyond loading its own module and dictionary files from the same origin. After it reports ready, no operation may make a network request.

#### Scenario: Network cut after ready
- **WHEN** the worker has reported ready and the network then goes away
- **THEN** spell and suggest requests keep returning results

### Requirement: Load and readiness reporting
The page SHALL be able to ask the worker to load a set of languages. The worker MUST reply with which languages loaded and which failed, so one missing dictionary does not block the others.

#### Scenario: English only available
- **WHEN** the worker is asked to load English and Arabic but only the English files exist
- **THEN** it reports ready with English loaded and Arabic failed, with a reason

#### Scenario: Both languages available
- **WHEN** both dictionary pairs exist
- **THEN** it reports ready with English and Arabic loaded

### Requirement: Spell and suggest requests
The worker SHALL answer spell requests (correct or incorrect) and suggest requests (an ordered list) for a given word and language. Each reply MUST carry the request's identifier, so callers can match replies to requests and ignore stale ones.

#### Scenario: English misspelling
- **WHEN** the page asks whether "recieve" is spelled correctly in English
- **THEN** the reply carries the same request id and says incorrect
- **AND** a suggest request for the same word includes "receive"

#### Scenario: Arabic word
- **WHEN** Arabic is loaded and the page sends a spell request for "مرحبا" in Arabic
- **THEN** the reply carries the request id and a correct-or-incorrect result

#### Scenario: Unloaded language
- **WHEN** a request names a language that is not loaded
- **THEN** the reply is an error naming that language, and the worker keeps serving other requests

### Requirement: Never blocks the page
All engine work SHALL happen in the worker. The page thread MUST NOT load the engine or the dictionaries.

#### Scenario: Typing during dictionary load
- **WHEN** a user types in a demo composer while dictionaries are still loading
- **THEN** keystrokes appear without visible delay

### Requirement: Batch check
The worker SHALL accept a batch check request with a list of words per language, and reply with which of those words are misspelled. The reply MUST carry the request id. A batch MUST be answered offline, with no network access.

#### Scenario: Mixed batch
- **WHEN** the page sends one batch with English ["receive", "recieve"] and Arabic ["مرحبا"]
- **THEN** the reply carries the same id and lists only "recieve" as misspelled

#### Scenario: Batch with an unloaded language
- **WHEN** a batch includes words for a language that is not loaded
- **THEN** those words are reported as unchecked (neither correct nor misspelled), and the loaded languages' words are still answered

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
