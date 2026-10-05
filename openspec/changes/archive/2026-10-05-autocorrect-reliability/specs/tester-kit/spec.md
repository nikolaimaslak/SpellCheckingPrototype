## MODIFIED Requirements

### Requirement: Tester guide
The repository SHALL include `docs/TESTING.md` with:
- requirements (Node version, supported browsers);
- the start command;
- a numbered scenario for each feature (spell check, auto-correct, inline completion, knowledge base grounding, grammar polish, admin and agent settings, telemetry summary), each with exact input text in English and Arabic where relevant and the expected result;
- known limitations;
- data-handling rules (synthetic text only when the Gemini banner shows);
- how to report a problem.

#### Scenario: Scenario has expected results
- **WHEN** a tester follows the auto-correct scenario
- **THEN** it lists inputs that change, such as "please seperate " → "please separate ", "المستخذم " → "المستخدم" and "oNly " → "only"
- **AND** it lists inputs that must **not** change: "recieve " and "afte " (ambiguous), "النضام " (ambiguous in Arabic, underlined with "النظام" offered), "GOSSI " (all caps), and "info@gosi.gov.sa " (email address)

#### Scenario: Known limitations listed
- **WHEN** a tester reads the known-limitations section
- **THEN** it explains ambiguous short typos, that many Arabic typos are only underlined and not auto-corrected, Arabic ghost text on the line below in a left-to-right composer, completion latency, and that all customer and knowledge content is synthetic
