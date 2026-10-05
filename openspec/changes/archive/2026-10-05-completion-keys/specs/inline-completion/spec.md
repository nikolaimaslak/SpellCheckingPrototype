## MODIFIED Requirements

### Requirement: Accepting and ignoring
While ghost text is showing, the agent SHALL be able to:
- **accept all of it** with Tab, or with the **forward arrow**: the arrow key that points in the suggestion's reading direction. That's Right Arrow for a left-to-right suggestion and Left Arrow for a right-to-left (Arabic) one, also when the composer has a fixed left-to-right base direction and the ghost text sits on the line below;
- **accept the next word** with Ctrl + the forward arrow, or Option (Alt) + the forward arrow on macOS. The next word is any leading whitespace followed by everything up to the next whitespace. The rest of the ghost text MUST stay showing.

Every accept MUST insert the text at the caret through the same native edit path as other changes: one undo step per accept, and a host `input` event. These keys MUST only be intercepted while ghost text is showing and the focus is in the composer. Otherwise they behave as the host normally handles them.

Typing characters that match the start of the ghost text MUST consume them and keep showing the rest. The following MUST dismiss the ghost text without changing the text:
- typing anything else;
- pressing Escape;
- the other arrow (the one pointing backward), Up, Down, Home, End, Page Up or Page Down, or any arrow with Shift;
- clicking elsewhere.

When the last of the ghost text has been accepted or typed through, the next completion SHALL be requested by the usual pause rule. No new completion is requested while words of the current one remain. All of this MUST work without the completion service being reachable at the moment of the key press.

#### Scenario: Tab accepts
- **WHEN** ghost text is showing and the agent presses Tab
- **THEN** the text is inserted, the caret moves to its end, focus stays in the composer, and one Undo removes the inserted text

#### Scenario: Tab without ghost text
- **WHEN** no ghost text is showing and the agent presses Tab
- **THEN** the key behaves as the host normally handles it

#### Scenario: Right Arrow accepts an English suggestion
- **WHEN** ghost text " will be processed within 3 working days." is showing after "your request" and the agent presses Right Arrow
- **THEN** the whole text is inserted as with Tab, and the host does not also move the caret

#### Scenario: Left Arrow accepts an Arabic suggestion
- **WHEN** ghost text " وسيتم الرد عليك قريباً" is showing after the Arabic sentence "تم استلام طلبك" and the agent presses Left Arrow
- **THEN** the whole text is inserted, and one Undo removes it

#### Scenario: Arabic suggestion in a fixed left-to-right composer
- **WHEN** the composer has a fixed LTR base direction, Arabic ghost text is showing on the line below, and the agent presses Left Arrow
- **THEN** the whole text is inserted

#### Scenario: Backward arrow dismisses
- **WHEN** an English suggestion is showing and the agent presses Left Arrow, or an Arabic suggestion is showing and the agent presses Right Arrow
- **THEN** the ghost text disappears, the text is unchanged, and the caret moves as the host normally moves it

#### Scenario: Arrow without ghost text
- **WHEN** no ghost text is showing and the agent presses Right Arrow
- **THEN** the key behaves as the host normally handles it

#### Scenario: Accept word by word
- **WHEN** ghost text " will be processed within 3 working days." is showing and the agent presses Ctrl+Right Arrow twice
- **THEN** " will" and then " be" are inserted, the ghost text now shows " processed within 3 working days.", and one Undo removes " be" only

#### Scenario: Accept an Arabic word
- **WHEN** ghost text " وسيتم الرد عليك قريباً" is showing and the agent presses Ctrl+Left Arrow
- **THEN** " وسيتم" is inserted and the ghost text shows " الرد عليك قريباً"

#### Scenario: Word accept on macOS
- **WHEN** the platform is macOS, ghost text is showing, and the agent presses Option+Right Arrow
- **THEN** the next word is inserted, as with Ctrl+Right Arrow elsewhere

#### Scenario: Last word accepted
- **WHEN** the agent accepts the last word of the ghost text with Ctrl+Right Arrow
- **THEN** no ghost text remains, and after the usual pause a new completion may be requested

#### Scenario: Mixing word accepts and typing
- **WHEN** the agent accepts " will" with Ctrl+Right Arrow, then types " be", then presses Tab
- **THEN** the rest " processed within 3 working days." is inserted

#### Scenario: Typing through
- **WHEN** ghost text " will be processed" is showing and the agent types " wi"
- **THEN** the ghost text now shows "ll be processed"

#### Scenario: Diverging
- **WHEN** ghost text " will be processed" is showing and the agent types " has"
- **THEN** the ghost text disappears

#### Scenario: Escape
- **WHEN** ghost text is showing and the agent presses Escape
- **THEN** it disappears, the text is unchanged, and no other Escape handling in the host is triggered

#### Scenario: Shift+arrow selects
- **WHEN** ghost text is showing and the agent presses Shift+Right Arrow
- **THEN** the ghost text disappears and the host extends the selection as usual

### Requirement: Completion events
The client SHALL emit `completion-shown`, `completion-accepted` and `completion-dismissed` events with the language, the round-trip latency, and the length of the shown and accepted text. A suggestion of which at least one word was accepted with the word-accept key SHALL end with `completion-accepted`, whose accepted length counts every accepted or typed-through character, not with `completion-dismissed`. The events MUST NOT contain the completion text or the composer text.

#### Scenario: Shown then accepted
- **WHEN** a completion is shown and the agent presses Tab
- **THEN** `completion-shown` and then `completion-accepted` are emitted, carrying latency and length but no text

#### Scenario: Partly accepted
- **WHEN** a 40-character completion is shown, the agent accepts one 5-character word with Ctrl+Right Arrow, and then types something else
- **THEN** `completion-shown` and then one `completion-accepted` with shown length 40 and accepted length 5 are emitted, and no `completion-dismissed`

#### Scenario: Forward arrow counts as accepted
- **WHEN** a completion is shown and the agent presses the forward arrow
- **THEN** `completion-accepted` is emitted with the full length, as for Tab
