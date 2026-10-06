## MODIFIED Requirements

### Requirement: One-command start
`npm run demo` SHALL:
1. check that the Node version is supported and that `uv` is installed;
2. provision the dictionaries;
3. prepare the Python environment for the completion server (`uv sync`, which also installs the pinned Python when missing);
4. start the completion server and the demo page together;
5. print the demo URL and the active completion model;
6. stop both processes when the tester presses Ctrl+C or either process exits.

It MUST fail early with a clear message when Node is too old, when `uv` is missing (saying how to install it), when the Python environment can't be prepared, or when a required port is taken.

#### Scenario: Fresh start
- **WHEN** a tester with Node and `uv` installed runs `npm install` and then `npm run demo` on a fresh clone
- **THEN** the Python environment is prepared, both servers start, and one line tells them to open `http://localhost:5173/` and which completion model is active

#### Scenario: Old Node
- **WHEN** the installed Node is older than the supported version
- **THEN** the command exits with a message naming the required version, before starting anything

#### Scenario: uv missing
- **WHEN** `uv` is not on the PATH
- **THEN** the command exits before starting anything, with a message naming `uv` and its install command

#### Scenario: Port in use
- **WHEN** port 5173 or 5175 is already in use
- **THEN** the command exits with a message naming the port and how to free it or choose another

#### Scenario: Clean shutdown
- **WHEN** the tester presses Ctrl+C
- **THEN** both processes stop, and nothing keeps listening on either port

### Requirement: Environment template
The repository SHALL include `.env.example` documenting what each setting means for data leaving the machine:
- `GEMINI_API_KEY`;
- `COMPLETION_MODEL`: `auto`, `gemini`, `fake`, or a provider-qualified model id such as a local model;
- `COMPLETION_API_BASE`;
- `COMPLETION_MAX_TURNS`: optional; unset passes the full conversation to the model;
- `ASSIST_LLM_CACHE`: off by default, and what turning it on stores.

`.env` and the LLM cache directory MUST remain excluded from version control.

#### Scenario: Template present
- **WHEN** a tester opens `.env.example`
- **THEN** it explains that without a key the offline test model is used, that with a key typed text is sent to Google, and that a local model id keeps text on the machine

#### Scenario: Cache explained
- **WHEN** a tester reads the `ASSIST_LLM_CACHE` entry
- **THEN** it says the cache is off by default and, when on, stores the text sent to the model under a git-ignored directory

### Requirement: Tester guide
The repository SHALL include `docs/TESTING.md` with:
- requirements (Node version, `uv`, supported browsers);
- the start command;
- a numbered scenario for each feature (spell check, auto-correct, inline completion, knowledge base grounding, grammar polish, admin and agent settings, telemetry summary), each with exact input text in English and Arabic where relevant and the expected result;
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
