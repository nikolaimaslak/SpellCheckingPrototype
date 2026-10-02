# Spec Delta

## Purpose

Provides a local demo page with a chat composer and a rich-text email composer that stand in for the Agent Desktop editors, so every phase of the composer assistance layer can be tried by hand in Arabic, English and mixed text.

## ADDED Requirements

### Requirement: Chat stand-in composer
The demo page SHALL provide a chat composer where Enter sends the message into a visible transcript and Shift+Enter inserts a line break.

#### Scenario: Send a message
- **WHEN** the user types "Hello, how can I help?" and presses Enter
- **THEN** the message appears in the transcript and the composer is emptied

#### Scenario: Line break
- **WHEN** the user presses Shift+Enter
- **THEN** a line break is inserted and nothing is sent

### Requirement: Email stand-in composer
The demo page SHALL provide a rich-text email composer that supports at least bold, italic and lists, so later phases can be tested against words split across formatting boundaries.

#### Scenario: Formatting splits a word
- **WHEN** the user bolds the first half of a word
- **THEN** the composer keeps the formatting and the word still reads as one word on screen

### Requirement: Arabic and mixed-direction text
Both composers SHALL work out text direction from the content, so Arabic paragraphs render right to left, English left to right, and mixed sentences display in correct bidirectional order.

#### Scenario: Arabic message
- **WHEN** the user types "مرحبا، كيف يمكنني مساعدتك؟"
- **THEN** the composer shows the text right-aligned in RTL order

#### Scenario: Mixed sentence
- **WHEN** the user types "رقم الطلب في نظام GOSI هو"
- **THEN** the Latin word "GOSI" sits inline in correct bidi order within the RTL sentence

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
