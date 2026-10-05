# tester-kit Specification

## Purpose

Lets an external tester start the prototype locally in a few minutes, know what correct behavior looks like for each feature in Arabic and English, and report problems in a way the team can reproduce.

## Requirements

### Requirement: One-command start
`npm run demo` SHALL check that the Node version is supported, provision the dictionaries, start the completion server and the demo page together, print the demo URL and the active completion model, and stop both processes when the tester presses Ctrl+C or either process exits. It MUST fail early with a clear message when Node is too old or a required port is taken.

#### Scenario: Fresh start
- **WHEN** a tester runs `npm install` and then `npm run demo` on a fresh clone
- **THEN** both servers start, and one line tells them to open `http://localhost:5173/` and which completion model is active

#### Scenario: Old Node
- **WHEN** the installed Node is older than the supported version
- **THEN** the command exits with a message naming the required version, before starting anything

#### Scenario: Port in use
- **WHEN** port 5173 or 5175 is already in use
- **THEN** the command exits with a message naming the port and how to free it or choose another

#### Scenario: Clean shutdown
- **WHEN** the tester presses Ctrl+C
- **THEN** both processes stop, and nothing keeps listening on either port

### Requirement: Environment template
The repository SHALL include `.env.example` documenting `GEMINI_API_KEY` and `COMPLETION_MODEL` (`auto`, `gemini`, `fake`) with what each choice means for data leaving the machine. `.env` MUST remain excluded from version control.

#### Scenario: Template present
- **WHEN** a tester opens `.env.example`
- **THEN** it explains that without a key the offline test model is used, and that with a key typed text is sent to Google

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

### Requirement: Report template
The repository SHALL include a test report template (`docs/TEST-REPORT-TEMPLATE.md`, mirrored as `.github/ISSUE_TEMPLATE/test-report.md`) asking for scenario number, steps, exact input text, expected and actual result, browser and version, language, the model banner shown, the version stamp, and an optional screenshot.

#### Scenario: Template fields
- **WHEN** a tester opens the report template
- **THEN** it asks for the version stamp and the model banner shown on the page

### Requirement: Tester-first README
The README SHALL begin with a quick start for testers (clone, `npm install`, `npm run demo`, open the URL), supported browsers, what the model banner means, troubleshooting (port in use, use `localhost` rather than `127.0.0.1`, no key), and a link to the tester guide. Developer commands and architecture details MUST follow after that.

#### Scenario: Quick start first
- **WHEN** a tester opens the README
- **THEN** the first section tells them how to start the demo in three commands and where the tester guide is
