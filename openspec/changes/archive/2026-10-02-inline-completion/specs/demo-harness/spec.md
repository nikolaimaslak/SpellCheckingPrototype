# Spec Delta

## MODIFIED Requirements

### Requirement: Admin and agent settings panel
The demo page SHALL provide a settings panel standing in for Contact Center Administrator: admin mode (`off`, `suggest`, `auto`), enabled languages, "agents may choose a less aggressive mode", a custom dictionary (one word per line), completion enablement (`off`, `all`, `listed` with team and user lists), and completion context sources. It SHALL also provide agent controls: a mode preference and a completion on/off preference, changeable only while agent choice is allowed, plus a "current agent" user and team selector. Applying changes MUST re-attach both composers with the resolved effective mode and completion setting. The settings MUST persist for that browser across page reloads.

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

## ADDED Requirements

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
