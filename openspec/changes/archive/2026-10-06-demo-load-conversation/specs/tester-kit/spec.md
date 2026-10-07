## MODIFIED Requirements

### Requirement: Tester guide
The repository SHALL include `docs/TESTING.md` with:
- requirements (Node version, `uv`, supported browsers);
- the start command;
- a numbered scenario for each feature (spell check, auto-correct, inline completion, knowledge base grounding, grammar polish, admin and agent settings, loading a conversation, telemetry summary), each with exact input text in English and Arabic where relevant and the expected result;
- known limitations;
- data-handling rules (synthetic text only when the Gemini banner shows);
- how to report a problem.

#### Scenario: Scenario has expected results
- **WHEN** a tester follows the auto-correct scenario
- **THEN** it lists inputs that change, such as "please seperate " → "please separate ", "teh " → "the", "اذا كان" → "إذا كان", "المستخذم " → "المستخدم" and "oNly " → "only"
- **AND** it lists inputs that must **not** change: "afte " (ambiguous), "ان " and "النضام " (ambiguous in Arabic, underlined), "GOSSI " and "TEH " (all caps), and "info@gosi.gov.sa " (email address)

#### Scenario: Confidence setting scenario
- **WHEN** a tester follows the auto-replace confidence scenario
- **THEN** it has them set "Misspellings list only", type "teh paymnet ", and expect "the paymnet " with "paymnet" underlined

#### Scenario: Known limitations listed
- **WHEN** a tester reads the known-limitations section
- **THEN** it explains ambiguous short typos, that many Arabic typos are only underlined and not auto-corrected, Arabic ghost text on the line below in a left-to-right composer, completion latency, and that all customer and knowledge content is synthetic

#### Scenario: uv in the requirements
- **WHEN** a tester reads the requirements section
- **THEN** it lists `uv` with its install command next to Node

#### Scenario: Conversation loading scenario
- **WHEN** a tester follows the conversation-loading scenario
- **THEN** it has them load `eval/completion/examples/chat-example.txt`, choose a conversation and "before agent message 2", check that canned responses are now off, and type the agent's message to watch the suggestions, in English and in Arabic
