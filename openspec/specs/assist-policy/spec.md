# assist-policy Specification

## Purpose

Defines how an administrator controls composer assistance tenant-wide, which choices are left to the agent, and how the admin's custom dictionary affects checking and correction.

## Requirements

### Requirement: Admin policy
An admin policy SHALL define:
- the assistance mode: `off`, `suggest` or `auto`;
- the enabled languages (any of English and Arabic);
- whether agents may choose a less aggressive mode;
- a custom dictionary of words;
- inline completion enablement: `off`, `all` (everyone), or `listed` (only the listed teams and users);
- the completion context sources: transcript and canned responses, each on or off.

#### Scenario: Off
- **WHEN** the admin mode is `off`
- **THEN** no assistance is attached to any composer, and native browser spellcheck is left as the host set it

#### Scenario: Languages limited
- **WHEN** the policy enables only Arabic
- **THEN** English words are neither underlined nor corrected

#### Scenario: Completion for listed teams
- **WHEN** completion is `listed` with team "Pensions", and the current agent is on team "Pensions"
- **THEN** completion is enabled for that agent, and disabled for an agent on another team who isn't listed by user

#### Scenario: Completion for a listed user
- **WHEN** completion is `listed` with user "agent.42", and the current agent is "agent.42" on an unlisted team
- **THEN** completion is enabled for that agent

### Requirement: Admin settings take precedence
The effective mode SHALL be the admin mode, unless the admin allows agent choice and the agent has chosen a mode that is less aggressive (`off` < `suggest` < `auto`). An agent preference MUST NOT raise the mode above the admin's. Likewise, inline completion SHALL be effective only if the admin enables it for the agent and, when the admin allows agent choice, the agent hasn't turned it off. An agent MUST NOT be able to enable completion the admin hasn't enabled for them.

#### Scenario: Agent lowers auto to suggest
- **WHEN** the admin mode is `auto`, agent choice is allowed, and the agent prefers `suggest`
- **THEN** the effective mode is `suggest`

#### Scenario: Agent cannot raise
- **WHEN** the admin mode is `suggest` and the agent prefers `auto`
- **THEN** the effective mode is `suggest`

#### Scenario: Agent choice not allowed
- **WHEN** the admin mode is `auto`, agent choice is not allowed, and the agent prefers `off`
- **THEN** the effective mode is `auto`

#### Scenario: Agent turns completion off
- **WHEN** completion is enabled for the agent, agent choice is allowed, and the agent turns completion off
- **THEN** completion is not effective for that agent

#### Scenario: Agent cannot turn completion on
- **WHEN** completion is `off` in the admin policy and the agent's preference says on
- **THEN** completion is not effective

### Requirement: Custom dictionary
Each custom dictionary word SHALL be added to the engine of the language matching its script when that language loads. Custom words MUST never be underlined or auto-replaced, and MUST be available as suggestions and auto-correct targets. Words whose script matches no enabled language MUST be ignored.

#### Scenario: Product name accepted
- **WHEN** "GOSI" is in the custom dictionary
- **THEN** "GOSI" is never underlined, and "GOSSI" is offered "GOSI" as a suggestion

#### Scenario: Arabic term accepted
- **WHEN** "التأمينات" is in the custom dictionary
- **THEN** it is never underlined

#### Scenario: Custom word as auto-correct target
- **WHEN** "Absher" is in the custom dictionary and the agent types "Abshr " in `auto` mode
- **THEN** it becomes "Absher" if it is the only one-edit candidate

### Requirement: Policy changes apply on reload
A changed policy SHALL take effect for composers attached after the change. The prototype's equivalent of the architecture's "on next login" is re-attaching with a new spell service.

#### Scenario: Admin switches to suggest
- **WHEN** the admin changes the mode from `auto` to `suggest` and composers are re-attached
- **THEN** no further automatic changes happen, and underlines remain
