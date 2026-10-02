# Spec Delta

## Purpose

Adds suggest-only spell checking to a chat or email composer: misspelled Arabic and English words are underlined, and the agent chooses whether and how to fix each one. Every check runs in the browser without network access, and nothing is ever changed automatically.

## ADDED Requirements

### Requirement: Attach and detach
The layer SHALL attach to any `contenteditable` composer with options for which languages to check and whether checking is enabled. `detach` MUST remove every effect it had on the host, returning the composer to its prior state.

#### Scenario: Attach to the Agent Desktop chat composer
- **WHEN** the layer attaches to a `<div contenteditable="true">` styled with normal white-space and LTR direction
- **THEN** spell checking works without the host's markup, styles or event handlers being replaced

#### Scenario: Disabled
- **WHEN** the layer attaches with checking disabled
- **THEN** no underlines appear, and the composer's native spellcheck setting is left as it was

#### Scenario: Detach restores the host
- **WHEN** `detach` is called
- **THEN** underlines, the popover, any injected style and the layer's listeners are removed, and the composer's original `spellcheck` attribute is restored

### Requirement: Offline, off-thread checking
All checking SHALL happen in the browser with no network access after the engine is ready. Engine work MUST stay off the page thread.

#### Scenario: Network unavailable
- **WHEN** the engine is ready and the network goes away
- **THEN** underlines and suggestions keep working in both languages

### Requirement: Suggest-only underlines
Each settled word that is misspelled in its language SHALL be underlined. The layer MUST NOT change composer text unless the agent explicitly accepts a suggestion. Underlines MUST NOT be written into the editable DOM, so they cannot reach the sent message or the host's undo history.

#### Scenario: English misspelling
- **WHEN** the agent types "I will recieve it " in the chat composer
- **THEN** "recieve" is underlined within the debounce interval, and no other word is

#### Scenario: Arabic misspelling
- **WHEN** the agent types an Arabic sentence that contains one misspelled word followed by a space
- **THEN** only that word is underlined

#### Scenario: Mixed sentence
- **WHEN** the agent types "رقم الطلب في نظام GOSSI هو "
- **THEN** "GOSSI" is checked against English and underlined, and the Arabic words are checked against Arabic

#### Scenario: Pending word not flagged
- **WHEN** the agent is partway through typing "recie"
- **THEN** it is not underlined until the agent moves past it

#### Scenario: Underline kept while the caret is inside
- **WHEN** the agent clicks or moves the caret into an already-underlined word without changing it
- **THEN** the word stays underlined

#### Scenario: Sent message is clean
- **WHEN** the agent sends a chat message containing an underlined word
- **THEN** the sent text and the host's composer HTML contain no underline markup

#### Scenario: Underline follows edits
- **WHEN** the agent fixes an underlined word by hand
- **THEN** its underline disappears at the next check, and underlines on other words stay on the right words even if text before them changed

### Requirement: Valid Arabic forms are never flagged
An Arabic word SHALL be treated as correct if it is correct as written, or after diacritics (tashkeel) and tatweel are removed. Hamza and alef variants MUST NOT be folded when deciding correctness, so a wrong hamza is still flagged.

#### Scenario: Vowelled word
- **WHEN** the agent types "مَرْحَبًا "
- **THEN** it is not underlined

#### Scenario: Tatweel
- **WHEN** the agent types "مرحـــبا "
- **THEN** it is not underlined

#### Scenario: Wrong hamza still flagged
- **WHEN** the agent types a word whose only error is a missing or misplaced hamza, and the bare form is not in the dictionary
- **THEN** it is underlined, and the correctly hamzated form is offered as a suggestion

### Requirement: Suggestion popover
The agent SHALL be able to open suggestions for an underlined word by clicking it, or by keyboard when the caret is in it. The popover MUST list the engine's suggestions in order (at most five), plus "Ignore". It MUST be dismissible with Escape (focus stays in the composer) or by clicking elsewhere (focus goes where the agent clicked), and MUST lay out right to left for Arabic words.

#### Scenario: Open by click
- **WHEN** the agent clicks an underlined word
- **THEN** a popover appears next to the word with up to five suggestions and "Ignore"

#### Scenario: Open by keyboard
- **WHEN** the caret is inside an underlined word and the agent presses the suggestion shortcut
- **THEN** the popover opens with the first suggestion focused, and arrow keys and Enter choose one

#### Scenario: Arabic popover
- **WHEN** the popover opens for an Arabic word
- **THEN** its suggestions read and align right to left

#### Scenario: No suggestions
- **WHEN** the engine has no suggestions for the word
- **THEN** the popover says there are no suggestions and still offers "Ignore"

#### Scenario: Dismiss with Escape
- **WHEN** the agent presses Escape while the popover is open
- **THEN** the popover closes, focus and caret are where they were in the composer, and the text is unchanged

#### Scenario: Dismiss by clicking elsewhere
- **WHEN** the agent clicks outside the popover
- **THEN** the popover closes, the text is unchanged, and focus goes wherever the agent clicked (it is not pulled back into the composer)

### Requirement: Accepting a suggestion
Accepting a suggestion SHALL replace exactly that word through the editor's native input path, so the host app receives a normal input event. A single undo MUST restore the original word. The caret MUST end right after the replacement.

#### Scenario: Replace and undo
- **WHEN** the agent accepts "receive" for "recieve"
- **THEN** the composer reads "I will receive it", the caret sits after "receive", and one Undo brings back "recieve"

#### Scenario: Host sees the change
- **WHEN** a suggestion is accepted in a host that listens for `input` events
- **THEN** the host's listener fires once for the replacement

#### Scenario: Formatting preserved in email
- **WHEN** a suggestion is accepted for a word inside bold text in the email composer
- **THEN** the replacement is bold, and the surrounding formatting is unchanged

### Requirement: Session ignore list
Choosing "Ignore" SHALL stop that word, in that language, from being flagged in this composer for the rest of the page session. Ignoring MUST NOT change composer text.

#### Scenario: Ignore a name
- **WHEN** the agent chooses "Ignore" on "Khalil"
- **THEN** every occurrence of "Khalil" loses its underline, and later occurrences are not flagged

### Requirement: Native spellcheck handover
While the engine is loading, the composer SHALL keep the browser's native spellcheck. Once the engine is ready for at least one language, the layer MUST set `spellcheck="false"` on the composer, so the agent never sees two checkers disagree.

#### Scenario: Engine becomes ready
- **WHEN** the worker reports ready
- **THEN** the composer gets `spellcheck="false"` and the layer's underlines take over

#### Scenario: Engine fails
- **WHEN** no language loads
- **THEN** the composer keeps native spellcheck and the layer shows no underlines

### Requirement: Typing stays responsive
Checking SHALL never make typing wait. Text edits trigger checks on a debounce, only words not already cached are sent to the worker, and stale replies MUST be dropped.

#### Scenario: Fast typing
- **WHEN** the agent types continuously for several seconds
- **THEN** keystrokes appear without delay, and underlines settle within the debounce interval after the agent pauses

#### Scenario: Long paste
- **WHEN** the agent pastes a 300-word mixed Arabic and English paragraph
- **THEN** typing stays responsive, and underlines appear for misspelled words without blocking input
