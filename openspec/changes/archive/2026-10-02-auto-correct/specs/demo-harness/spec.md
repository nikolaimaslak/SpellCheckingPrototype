# Spec Delta

## ADDED Requirements

### Requirement: Admin and agent settings panel
The demo page SHALL provide a settings panel standing in for Contact Center Administrator: admin mode (`off`, `suggest`, `auto`), enabled languages, "agents may choose a less aggressive mode", and a custom dictionary (one word per line). It SHALL also provide an agent mode preference that can only be changed while agent choice is allowed. Applying changes MUST re-attach both composers with the resolved effective mode. The settings MUST persist for that browser across page reloads.

#### Scenario: Switch to auto
- **WHEN** the admin mode is set to `auto` and applied
- **THEN** typing "please seperate " in either composer produces "please separate "

#### Scenario: Agent preference locked
- **WHEN** agent choice is not allowed
- **THEN** the agent preference control is disabled, and the effective mode shown equals the admin mode

#### Scenario: Custom word
- **WHEN** "GOSI" is added to the custom dictionary and applied
- **THEN** "GOSI" is no longer underlined in either composer

### Requirement: Assistance event counter
The demo page SHALL show running counts of auto-corrections, reverts, accepted suggestions and ignores for the session.

#### Scenario: Counts update
- **WHEN** a word is auto-corrected and then reverted with Undo
- **THEN** the auto-correct and revert counts each increase by one
