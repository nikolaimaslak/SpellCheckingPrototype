# Spec Delta

## MODIFIED Requirements

### Requirement: Attach and detach
The layer SHALL attach to any `contenteditable` composer with options for which languages to check and the effective assistance mode (`suggest` or `auto`; `off` means the layer is not attached). `detach` MUST remove every effect it had on the host, returning the composer to its prior state.

#### Scenario: Attach to the Agent Desktop chat composer
- **WHEN** the layer attaches to a `<div contenteditable="true">` styled with normal white-space and LTR direction
- **THEN** spell checking works without the host's markup, styles or event handlers being replaced

#### Scenario: Disabled
- **WHEN** the effective mode is `off`, so the layer is not attached
- **THEN** no underlines appear, and the composer's native spellcheck setting is left as it was

#### Scenario: Detach restores the host
- **WHEN** `detach` is called
- **THEN** underlines, flashes, the popover, any injected style and the layer's listeners are removed, and the composer's original `spellcheck` attribute is restored

### Requirement: Suggest-only underlines
Each settled word that is misspelled in its language SHALL be underlined. In `suggest` mode, the layer MUST NOT change composer text unless the agent explicitly accepts a suggestion. In `auto` mode, it MAY additionally change text, but only as the `auto-correct` capability allows. Underlines MUST NOT be written into the editable DOM, so they cannot reach the sent message or the host's undo history.

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

#### Scenario: Suggest mode never changes text
- **WHEN** the mode is `suggest` and the agent types "please seperate "
- **THEN** the text is unchanged and "seperate" is underlined

### Requirement: Suggestion popover
The agent SHALL be able to open suggestions for an underlined word by clicking it, or by keyboard when the caret is in it. The popover MUST list the engine's suggestions in order (at most five), plus "Ignore". For a word that was auto-corrected and is still unchanged, the popover MUST instead offer "Revert to *original*". It MUST be dismissible with Escape (focus stays in the composer) or by clicking elsewhere (focus goes where the agent clicked), and MUST lay out right to left for Arabic words.

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

#### Scenario: Auto-corrected word
- **WHEN** the agent clicks a word that was just auto-corrected from "seperate" to "separate"
- **THEN** the popover offers "Revert to seperate"

#### Scenario: Dismiss with Escape
- **WHEN** the agent presses Escape while the popover is open
- **THEN** the popover closes, focus and caret are where they were in the composer, and the text is unchanged

#### Scenario: Dismiss by clicking elsewhere
- **WHEN** the agent clicks outside the popover
- **THEN** the popover closes, the text is unchanged, and focus goes wherever the agent clicked (it is not pulled back into the composer)
