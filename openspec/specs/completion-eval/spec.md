# completion-eval Specification

## Purpose

Testing inline completion, whose quality depends on a model that answers differently from run to run: a local, gitignored eval that builds test sets from chat samples or plain text by cutting agents' real messages, runs them through the completion program, and reports how often a suggestion is shown, whether its word and spacing are right; plus an older hand-written case dataset.

## Requirements

### Requirement: Completion case dataset
The project SHALL keep a completion case dataset in `eval/completion/cases.jsonl`: about 60 made-up cases of off-domain, generic chat, at least 15 in Arabic and at least 8 mixing Arabic and English. Each case MUST have:
- a unique `id`;
- a `lang` (`en`, `ar` or `mixed`);
- a `category`: `mid-word`, `finished-word`, `after-punctuation`, `after-space`, `new-sentence` or `details`;
- the agent's `prefix`;
- an optional `transcript` of `{ role, text }` turns;
- optional expectations:
  - `seamWord`: the word the agent is typing, as it must read after the suggestion, compared ignoring letter case and Arabic diacritics;
  - `expectShown` (default true);
  - `mustNotInvent`: details that must not appear unless present in the context.

Every case MUST use synthetic text only. A malformed line or a duplicate `id` MUST fail loading with the line number.

#### Scenario: Mid-word case
- **WHEN** a case has the prefix "Thank you for your pati" and `seamWord` "patience"
- **THEN** a suggestion "ence." is judged a correct seam, and "ent." or " ence." is not

#### Scenario: Arabic mid-word case
- **WHEN** a case has the prefix "شكراً على صبرك، سأرسل لك التفا" and `seamWord` "التفاصيل"
- **THEN** a suggestion starting "صيل" is judged a correct seam, and a diacritic on the suggestion doesn't change the verdict

#### Scenario: Mixed-language case
- **WHEN** a case has an Arabic prefix and a conversation that mixes Arabic with English terms
- **THEN** it loads with `lang` "mixed" and is reported in its own column

#### Scenario: Malformed dataset
- **WHEN** a line isn't valid JSON or repeats an `id`
- **THEN** loading fails, naming the line

### Requirement: Local evaluation workspace
The completion eval tool SHALL read and write only under `eval/local/completion/`, which version control ignores:
- `sources/` holds input files;
- `sets/<name>.jsonl` holds generated test sets;
- `runs/<timestamp>-<set>-<model>/` holds each run's raw answers (`samples.jsonl`), `report.md` and `report.json`.

The tool MUST create these folders when they're missing. It MUST NOT write anywhere else in the repository, and MUST NOT write the API key into any file it creates.

Inputs MUST be synthetic, public or redacted text with no personal data. When the selected model sends text outside the machine, the run MUST print a one-line reminder of this before it starts.

#### Scenario: Workspace ignored
- **WHEN** a set is built and run
- **THEN** every file the tool created is under `eval/local/completion/`, and `git status` shows none of them

#### Scenario: External model reminder
- **WHEN** a run starts with Gemini selected
- **THEN** it prints that the set's text is sent to Google and must contain no personal data, then runs

### Requirement: Input formats
The build command SHALL read two input formats.

**Chat text (the default):**
- Each turn starts on a line with a role label: `Customer:` or `Agent:`, or the Arabic `العميل:` or `الموظف:`. Labels are case-insensitive, and spaces around the colon are allowed.
- Lines without a label continue the previous turn, joined with a line break.
- A line holding only `---` ends a conversation.
- Lines starting with `#` are comments.
- Text before the first label MUST be reported with its line number and skipped.

**Plain text (`--plain`):** every paragraph (blank-line separated) is an agent message with no conversation. With `--split sentences`, every sentence is one, cut after `.`, `!`, `?` or `؟` followed by whitespace.

Text MUST be read as UTF-8, and line endings normalized.

#### Scenario: English chat
- **WHEN** the input holds "Customer: My request is stuck." and "Agent: Thank you for waiting, your request has been received."
- **THEN** one conversation with a customer turn and an agent turn is read

#### Scenario: Arabic labels
- **WHEN** the input holds "العميل: متى سيتم معالجة طلبي؟" and "الموظف: شكراً لانتظارك، تم استلام طلبك."
- **THEN** one conversation with a customer turn and an agent turn is read

#### Scenario: Mixed-language turns and continued lines
- **WHEN** an agent turn "Agent: أهلاً، سأساعدك في your Absher account" is followed by an unlabeled line "وسأرسل لك رابط الـ reset."
- **THEN** the turn's text is both lines joined with a line break

#### Scenario: Conversations separated
- **WHEN** two chats are separated by a `---` line
- **THEN** two conversations are read, and the second doesn't see the first's turns

#### Scenario: Plain text by sentences
- **WHEN** `--plain --split sentences` reads "Thank you for waiting. Your request has been received."
- **THEN** two agent messages with no conversation are read

### Requirement: Case generation
Every agent message SHALL be cut into cases, each holding:
- an `id` and the set name;
- `lang`: `en`, `ar` or `mixed` (mixed when the message has both scripts);
- a `category`: `mid-word`, `end-of-word`, `after-space` or `after-punctuation`;
- `prefix`: the message's text up to the cut;
- `transcript`: the conversation's turns before the message;
- `truth`: the message's text after the cut, up to the end of its sentence;
- `truthWord`: for `mid-word` and `end-of-word`, the whole word at the cut;
- `source`: the input file, conversation, message and character offset.

The cut categories are:
- `mid-word`: at least 2 letters of the word typed and at least 1 left;
- `end-of-word`: right after a word, before a space or punctuation;
- `after-space`: right after a space that follows a word;
- `after-punctuation`: right after `,` `:` `;` `.` `!` `?` `؟` or `،`, with no space typed yet.

A cut is used only when the sentence typed so far has at least 3 words (the client's request rule) and some text follows it in the message.

From the eligible cuts, at most `--per-category` (default 1) per category and message are chosen with a seeded random generator (`--seed`, default 1), so the same input and options always give the same set. A set with no cases MUST fail with a message saying why.

#### Scenario: Mid-word case
- **WHEN** the agent message is "Your contribution records are up to date." and a `mid-word` cut falls inside "records" after "rec"
- **THEN** the case has `prefix` "Your contribution rec", `truthWord` "records" and `truth` "ords are up to date."

#### Scenario: Arabic mid-word case
- **WHEN** the agent message is "شكراً لتواصلك معنا، تم استلام طلبك." and a `mid-word` cut falls after "استلا"
- **THEN** the case has `truthWord` "استلام" and `lang` "ar"

#### Scenario: Too little typed
- **WHEN** a message's first sentence is "Hi Noura." followed by a long sentence
- **THEN** no cut is made inside "Hi Noura.", where fewer than 3 words are typed

#### Scenario: Deterministic
- **WHEN** the same input is built twice with the same options
- **THEN** the two sets are identical, and a different `--seed` may give different cuts

### Requirement: Evaluation run
`npm run eval:completion -- --set <name>` SHALL run every case of the set `--samples` times (default 3) through the server's completion program in process:
- **model:** the one the server's settings select;
- **context:** canned responses and the knowledge base always off, the case's transcript on;
- **cache:** the LLM cache off, whatever `.env` says;
- **concurrency:** at most `--concurrency` requests in flight (default 4).

A request that fails or times out MUST count as an error and not stop the run. It MUST refuse to run with the offline test model unless `--allow-fake` is given. Each sample MUST be written to `samples.jsonl` with the case id, the completion, the edit, the withheld reason or error, and the latency.

#### Scenario: Run without canned responses or knowledge base
- **WHEN** a set is run
- **THEN** no request carries approved responses or knowledge base passages, and every request carries its case's transcript

#### Scenario: Errors counted
- **WHEN** some requests time out
- **THEN** the run finishes, and the report counts them as errors

#### Scenario: Offline model refused
- **WHEN** the run starts with no key and no `--allow-fake`
- **THEN** it exits with a message saying a live model is needed

### Requirement: Metrics and report
Each run SHALL write `report.md` and `report.json` with:
- the run settings: set, model, samples, seed and date;
- for each language (`en`, `ar`, `mixed`, `all`) and category, over all samples:
  - **shown:** non-empty completions ÷ samples;
  - **withheld:** `withheld: "format"` ÷ samples;
  - **errors:** failed or timed-out requests ÷ samples;
  - **word completion correct:** over shown samples of `mid-word` cases, the share whose completed word (`edit.word`) equals `truthWord`; over shown samples of `end-of-word` cases, the share that don't join the finished word. Letter case and Arabic diacritics and tatweel are ignored;
  - **spacing errors:** over shown samples, the share starting with whitespace after a prefix that ends with whitespace, or with a letter or digit after a prefix that ends with punctuation;
- latency p50 and p95, for information;
- the samples with a wrong word completion or a spacing error, with the prefix's end, the suggestion and the truth.

#### Scenario: Wrong join reported
- **WHEN** a `mid-word` case has `truthWord` "التفاصيل" and a sample's completed word is "التفااصيل"
- **THEN** that sample lowers the Arabic word completion figure and is listed with its prefix, suggestion and truth

#### Scenario: Finished word kept
- **WHEN** an `end-of-word` case has prefix "Your request" and a sample's completion is " has been received."
- **THEN** that sample counts as a correct word completion

#### Scenario: Spacing error counted
- **WHEN** an `after-punctuation` case has prefix "Thank you," and a sample's completion is "we have received your request."
- **THEN** that sample counts as a spacing error
