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
