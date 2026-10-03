# Spec Delta

## ADDED Requirements

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
