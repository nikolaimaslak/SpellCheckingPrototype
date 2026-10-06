# inline-completion Specification

## Purpose

Offers the agent a prediction of the rest of their current sentence as ghost text inside the same chat or email composer, in Arabic or English, which they accept with Tab or ignore by typing on. The composer's text and undo history are untouched until the agent accepts.

## Requirements

### Requirement: When a completion is requested
A completion SHALL be requested only when all of these hold:
- completion is enabled for the current agent;
- the agent has paused typing for the trigger delay (about 400 ms);
- the selection is a collapsed caret at the end of its line (no text after it on that line);
- the current sentence before the caret has at least 3 words;
- no IME composition is in progress and the spelling popover is not open.

Any keystroke, caret move or text change MUST cancel a request in flight, and its late answer MUST be discarded.

#### Scenario: Pause mid-sentence
- **WHEN** the agent types "Thank you for contacting us, your request" and pauses
- **THEN** one completion request is sent with that text as the prefix

#### Scenario: Too short
- **WHEN** the agent types "Thank you" and pauses
- **THEN** no request is sent

#### Scenario: Caret not at the end
- **WHEN** the caret is placed in the middle of existing text
- **THEN** no request is sent

#### Scenario: Typing cancels
- **WHEN** a request is in flight and the agent types another character
- **THEN** the request is aborted and its answer, if it arrives, is not shown

#### Scenario: Disabled
- **WHEN** completion is not enabled for the agent
- **THEN** no requests are sent, whatever is typed

### Requirement: Ghost text display
A completion SHALL be shown as ghost text that starts at the caret, in the composer's font and in a muted color. It MUST be drawn outside the editable DOM so it cannot reach the sent message, the host's model or the undo history. It MUST follow the text direction of the line, so it continues right to left after Arabic text. When the host composer has a fixed left-to-right base direction and the caret line is Arabic, the caret sits at the line's left edge with no room after it, so the ghost text MUST instead appear on the line directly below, left-aligned and in right-to-left order, where the host itself places wrapped Arabic text. When it reaches the composer's edge, it MUST wrap within the composer's width.

#### Scenario: English ghost text
- **WHEN** a completion " will be processed within 3 working days." arrives for "your request"
- **THEN** it appears in muted text immediately after the caret, and the composer's HTML is unchanged

#### Scenario: Arabic ghost text in an RTL line
- **WHEN** the composer resolves the line as right to left (for example with `dir="auto"`) and a completion arrives for an Arabic sentence
- **THEN** the ghost text continues on the same line, to the left of the caret, in right-to-left order

#### Scenario: Arabic ghost text under fixed LTR
- **WHEN** the composer has a fixed LTR base direction (Agent Desktop fidelity) and a completion arrives for an Arabic sentence
- **THEN** the ghost text appears on the line directly below the caret line, starting at the composer's left edge, in right-to-left order

#### Scenario: Sent message is clean
- **WHEN** the agent presses Enter (chat send) while ghost text is showing
- **THEN** the message is sent without the ghost text, and the ghost text disappears

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

### Requirement: Coexistence with spell checking
Inline completion SHALL work in every assistance mode, including when spell checking is off. Accepted completion text MUST be spell checked like typed text. Auto-correct MUST NOT run on text inserted by accepting a completion.

#### Scenario: Popover has priority
- **WHEN** the spelling popover is open
- **THEN** no ghost text is shown, and Tab, Enter and Escape go to the popover

#### Scenario: No auto-correct on accepted text
- **WHEN** an accepted completion ends with a space after a word that auto-correct would change
- **THEN** the accepted text is left as inserted

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

