# demo-harness Specification

## Purpose

Provides a local demo page with a chat composer and a rich-text email composer that stand in for the Agent Desktop editors, so every phase of the composer assistance layer can be tried by hand in Arabic, English and mixed text.

## Requirements

### Requirement: Chat stand-in composer
The demo page SHALL provide a chat composer that matches the Agent Desktop chat composer: a `contenteditable="true"` element with normal white-space, where Enter sends the message as plain text into a visible transcript, and Shift+Enter inserts a line break. It MUST offer controls that insert an emoji and a predefined message at the caret, as Agent Desktop's composer controls do.

#### Scenario: Send a message
- **WHEN** the user types "Hello, how can I help?" and presses Enter
- **THEN** the message appears in the transcript as plain text and the composer is emptied

#### Scenario: Line break
- **WHEN** the user presses Shift+Enter
- **THEN** a line break is inserted and nothing is sent

#### Scenario: Insert emoji and predefined message
- **WHEN** the user clicks the emoji control and then the predefined-message control
- **THEN** an emoji and a predefined message (English or Arabic) are inserted at the caret, and the composer keeps focus

### Requirement: Email stand-in composer
The demo page SHALL provide a rich-text email composer that supports at least bold, italic and lists, so later phases can be tested against words split across formatting boundaries.

#### Scenario: Formatting splits a word
- **WHEN** the user bolds the first half of a word
- **THEN** the composer keeps the formatting and the word still reads as one word on screen

### Requirement: Arabic and mixed-direction text
Both composers SHALL work out text direction from the content by default, so Arabic paragraphs render right to left, English left to right, and mixed sentences display in correct bidirectional order. An "Agent Desktop fidelity" toggle MUST switch the chat composer to the host's fixed LTR base direction, so behavior can be checked under the real host's conditions.

#### Scenario: Arabic message
- **WHEN** the user types "مرحبا، كيف يمكنني مساعدتك؟" with fidelity off
- **THEN** the composer shows the text right-aligned in RTL order

#### Scenario: Mixed sentence
- **WHEN** the user types "رقم الطلب في نظام GOSI هو"
- **THEN** the Latin word "GOSI" sits inline in correct bidi order within the sentence

#### Scenario: Fidelity mode
- **WHEN** fidelity is on and the user types an Arabic sentence
- **THEN** the chat composer keeps an LTR base direction like Agent Desktop, while the Arabic words themselves still render in correct RTL order

### Requirement: Engine status indicator
The demo page SHALL show the spelling worker's state (loading, ready, or failed) and which languages loaded.

#### Scenario: Arabic not provisioned
- **WHEN** the page loads and only English dictionaries exist
- **THEN** the indicator shows ready, English loaded, and Arabic unavailable

### Requirement: Runs locally offline
The demo page SHALL run from the local dev server with no external network requests: no CDN scripts, fonts or analytics.

#### Scenario: Offline dev session
- **WHEN** the dev server runs with the machine offline
- **THEN** the demo page loads fully and the status indicator reaches ready

### Requirement: Spell check on both demo composers
The demo page SHALL attach composer spell checking to the chat and email composers for English and Arabic, and SHALL offer a control that turns checking off and on (detach and attach).

#### Scenario: Underlines in both composers
- **WHEN** the user types "recieve " in either composer
- **THEN** the word is underlined once the engine is ready

#### Scenario: Toggle off
- **WHEN** the user turns spell checking off
- **THEN** all underlines disappear, and the composers return to native browser spellcheck

### Requirement: Admin and agent settings panel
The demo page SHALL provide a settings panel standing in for Contact Center Administrator, with these admin settings:
- the mode (`off`, `suggest`, `auto`);
- the auto-replace confidence ("Misspellings list only" or "Misspellings list and single-candidate rule");
- the enabled languages;
- "agents may choose a less aggressive mode";
- a custom dictionary (one word per line);
- completion enablement (`off`, `all`, `listed` with team and user lists);
- the completion context sources (conversation, canned responses, knowledge base);
- grammar polish enablement (`off`, `all`, `listed`).

It SHALL also provide agent controls: a mode preference, a completion on/off preference and a grammar polish on/off preference, changeable only while agent choice is allowed, plus a "current agent" user and team selector. Applying changes MUST re-attach both composers with the resolved effective mode, auto-replace confidence, completion and polish settings. The settings MUST persist for that browser across page reloads.

#### Scenario: Switch to auto
- **WHEN** the admin mode is set to `auto` and applied
- **THEN** typing "please seperate " in either composer produces "please separate "

#### Scenario: Agent preference locked
- **WHEN** agent choice is not allowed
- **THEN** the agent preference controls are disabled, and the effective settings shown equal the admin's

#### Scenario: Custom word
- **WHEN** "GOSI" is added to the custom dictionary and applied
- **THEN** "GOSI" is no longer underlined in either composer

#### Scenario: Completion for a listed team
- **WHEN** completion is `listed` for team "Pensions" and the current agent is switched from team "Pensions" to "Registration"
- **THEN** the effective settings show completion on, then off, and ghost text stops appearing after Apply

#### Scenario: Grammar polish enabled
- **WHEN** grammar polish is set to `all` and applied
- **THEN** both composers show a Polish button

#### Scenario: Misspellings list only
- **WHEN** the mode is `auto`, the auto-replace confidence is set to "Misspellings list only" and applied
- **THEN** typing "teh paymnet " in either composer produces "the paymnet " with "paymnet" underlined, and the setting is still selected after a reload

### Requirement: Assistance event counter
The demo page SHALL show running counts of auto-corrections, reverts, accepted suggestions and ignores for the session.

#### Scenario: Counts update
- **WHEN** a word is auto-corrected and then reverted with Undo
- **THEN** the auto-correct and revert counts each increase by one

### Requirement: Scripted customer conversation
The demo page SHALL let the user play customer messages into the chat transcript, from built-in English and Arabic GOSI-style scenarios and a free-text "customer says" input, so completions have conversation context. Customer and agent messages MUST be visually distinguished.

#### Scenario: Play an Arabic scenario
- **WHEN** the user starts the Arabic pension-inquiry scenario
- **THEN** its first customer message appears in the transcript, labeled as the customer and right to left

### Requirement: Synthetic canned responses
The demo SHALL ship a small canned-response library in English and Arabic, written for the demo and labeled as synthetic. It must not be real GOSI content.

#### Scenario: Library is labeled
- **WHEN** a reviewer opens the canned-response data file
- **THEN** it states that the content is synthetic demo data

### Requirement: Telemetry summary link
The demo page SHALL link to the telemetry summary served by the completion service.

#### Scenario: Open summary
- **WHEN** the user follows the link while the service runs
- **THEN** the summary page opens with the current counts

### Requirement: Active model banner
The demo page SHALL show which completion and polish model is active, from the service's health report:
- for Gemini, a prominent notice that typed text is sent to Google and only made-up text should be used;
- for the offline model, a notice that completion and polish show canned results;
- when the service is unreachable or has no model, a notice that completion and polish are unavailable while spell checking still works.

#### Scenario: Gemini active
- **WHEN** the service reports Gemini
- **THEN** the banner warns that typed text is sent to Google

#### Scenario: Service not running
- **WHEN** the completion service is not reachable
- **THEN** the banner says completion and polish are unavailable and spell checking still works offline

### Requirement: Presets and reset
The settings panel SHALL offer presets ("Spell check only", "Auto-correct", "Everything on") that fill and apply the settings, and a "Reset demo settings" control that restores the defaults and clears the stored settings.

#### Scenario: Everything on
- **WHEN** the tester chooses "Everything on"
- **THEN** auto-correct, inline completion and grammar polish are all effective after the settings apply

#### Scenario: Reset
- **WHEN** the tester chooses "Reset demo settings"
- **THEN** the settings return to the defaults (suggest only, completion and polish off), and a reload keeps the defaults

### Requirement: Version stamp
The demo page SHALL display the build's version: the package version plus the short git commit, or "unknown" when git isn't available.

#### Scenario: Stamp shown
- **WHEN** the tester opens the page from a git clone
- **THEN** the footer shows something like "v0.1.0 · 3abdde6"

### Requirement: Browser support notice
The demo page SHALL detect whether the browser supports the CSS Custom Highlight API. If it doesn't, it MUST show a notice naming the supported browsers, because spelling underlines and auto-correct highlights depend on it.

#### Scenario: Unsupported browser
- **WHEN** the page runs in a browser without `CSS.highlights`
- **THEN** a notice names the supported browsers (current Chrome, Edge, Safari 17.2+, Firefox 140+)
