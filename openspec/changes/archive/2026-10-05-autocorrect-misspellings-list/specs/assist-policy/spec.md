## MODIFIED Requirements

### Requirement: Admin policy
An admin policy SHALL define:
- the assistance mode: `off`, `suggest` or `auto`;
- the auto-replace confidence: `list` (only known misspellings) or `list-and-rule` (known misspellings, the case-only fix and the single-neighbor rule). The default is `list-and-rule`, and a missing or invalid value falls back to it;
- the enabled languages (any of English and Arabic);
- whether agents may choose a less aggressive mode;
- a custom dictionary of words;
- inline completion enablement: `off`, `all` (everyone), or `listed` (only the listed teams and users);
- the completion context sources: transcript, canned responses and knowledge base, each on or off;
- grammar polish enablement: `off`, `all`, or `listed` (only the listed teams and users).

The auto-replace confidence only affects `auto` mode, and agents cannot change it.

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

#### Scenario: Grammar polish for everyone
- **WHEN** grammar polish is `all`
- **THEN** every agent gets the Polish button

#### Scenario: Confidence defaults to list-and-rule
- **WHEN** a stored policy has no auto-replace confidence, or an unknown value
- **THEN** the effective confidence is `list-and-rule`

#### Scenario: List-only confidence
- **WHEN** the mode is `auto` and the auto-replace confidence is `list`
- **THEN** only known misspellings such as "teh" and "اذا" are auto-replaced; "paymnet" and "المستخذم" (not on the list) are underlined
