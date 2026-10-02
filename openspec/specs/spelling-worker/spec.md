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
