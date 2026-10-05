## MODIFIED Requirements

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
