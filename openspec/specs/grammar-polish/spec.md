# grammar-polish Specification

## Purpose

Lets the agent ask for a grammar and spelling correction of their whole draft with one button, review the proposed changes, and apply or discard them, in Arabic and English. The draft is never changed without the agent's explicit acceptance.

## Requirements

### Requirement: Polish button
When grammar polish is enabled for the agent, the composer SHALL show a "Polish" button next to it, drawn outside the editable DOM. The button MUST be reachable by keyboard and labeled for assistive technology. It MUST be disabled while the draft has fewer than 3 words or a polish request is in flight.

#### Scenario: Button appears
- **WHEN** polish is enabled and the agent has typed a draft of 3 or more words
- **THEN** an enabled "Polish" button is shown next to the composer, and the composer's HTML is unchanged

#### Scenario: Disabled for short drafts
- **WHEN** the draft has fewer than 3 words
- **THEN** the button is disabled

#### Scenario: Not enabled
- **WHEN** polish is not enabled for the agent
- **THEN** no button is shown

### Requirement: Preview panel
Pressing Polish SHALL send the draft to the polish service and show a panel anchored to the composer with the corrected text. Inserted or replaced words are highlighted, and removed words are shown struck through. The panel MUST lay out right to left for Arabic drafts. If the service returns no changes or fails, the panel MUST say so and offer only Close. While the panel is open, Escape MUST close it without changing the draft, and the host MUST NOT receive that Escape.

#### Scenario: English corrections shown
- **WHEN** the draft is "He go to the office yesterday and buyed a pen." and the service returns "He went to the office yesterday and bought a pen."
- **THEN** the panel shows the corrected sentence with "went" and "bought" highlighted, and "go" and "buyed" struck through

#### Scenario: Arabic draft
- **WHEN** the draft is Arabic
- **THEN** the panel's text reads right to left

#### Scenario: Nothing to fix
- **WHEN** the service returns the draft unchanged
- **THEN** the panel says no changes are suggested and offers only Close

#### Scenario: Service unavailable
- **WHEN** the polish service is unreachable or answers with an error
- **THEN** the panel says polishing is unavailable, and the draft is unchanged

### Requirement: Accepting changes
Accept SHALL apply only the changed spans, through the same native edit path as other changes, so the host receives normal input events. When all changes lie within one text run, they MUST be applied as a single replace that one Undo reverts. When changes span formatting boundaries, each changed span MUST be replaced separately so formatting is preserved, and a "Revert polish" control MUST be offered for 10 seconds that restores every original span in one click. If the draft changed after the preview was requested, Accept MUST be refused with a message asking the agent to polish again.

#### Scenario: Plain chat draft
- **WHEN** the agent accepts the corrections for a plain-text chat draft
- **THEN** the composer shows the corrected text, and one Undo restores the original draft

#### Scenario: Formatting preserved
- **WHEN** the email draft has "the office" in bold and corrections fall before and after it
- **THEN** after Accept, "the office" is still bold, and "Revert polish" restores the original words

#### Scenario: Draft edited meanwhile
- **WHEN** the agent typed in the composer after pressing Polish
- **THEN** Accept is refused, the draft keeps the agent's edits, and the panel asks them to polish again

### Requirement: Coexistence
Opening the polish panel SHALL dismiss any completion ghost text. Polish edits MUST NOT trigger auto-correct, because they are multi-character insertions. The spelling popover and the polish panel MUST NOT be open at the same time.

#### Scenario: Ghost dismissed
- **WHEN** ghost text is showing and the agent presses Polish
- **THEN** the ghost text disappears

### Requirement: Polish events
The client SHALL emit `polish-shown` (language, latency, number of changes), `polish-accepted` (language, number of changes), `polish-dismissed` and `polish-reverted`. The events MUST NOT contain draft or corrected text.

#### Scenario: Shown then accepted
- **WHEN** a polish with 2 changes is shown and accepted
- **THEN** `polish-shown` with changes 2 and `polish-accepted` are emitted, without text
