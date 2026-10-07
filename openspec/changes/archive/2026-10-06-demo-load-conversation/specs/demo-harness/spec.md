## ADDED Requirements

### Requirement: Load a conversation
The chat panel SHALL offer a "Load conversation" control.

**Input:** pasted text, or a local text file of up to 1 MB that the page reads itself. Loading MUST NOT make any network request, and the text MUST NOT leave the page.

**Format:** the chat format of the local completion eval:
- a turn starts with a `Customer:` or `Agent:` label, or the Arabic `العميل:` or `الموظف:`, case-insensitive, with spaces allowed around the colon;
- an unlabeled line continues the previous turn, joined with a line break;
- a line holding only `---` ends a conversation;
- lines starting with `#` are comments;
- text before the first label is skipped with a warning naming its line.

**Choice and stop point:**
- When the text holds more than one conversation, the user SHALL choose one from a list labeled with each conversation's number and the start of its first message.
- The user SHALL choose where to stop: before agent message 1 to N of the conversation, or the whole conversation. The default is before the last agent message.

**Loading:** the transcript is replaced with the chosen conversation's turns up to the stop point:
- customer and agent turns are labeled and visually distinguished as they are today;
- each turn has automatic text direction;
- they become the conversation that completion sends.

Loading SHALL then turn the "Canned responses" completion source off in the settings and apply the settings. The knowledge base and the other settings stay as they are, and the user can turn canned responses back on.

**Errors:** text with no labeled turn MUST show a message on the page saying so, and leave the transcript unchanged. No browser dialog may be used.

**Parser parity:** a shared fixture of inputs and their parsed conversations MUST give the same result in this parser and in the local eval's parser.

#### Scenario: Load an English conversation up to an agent message
- **WHEN** the user pastes a conversation of 2 customer and 2 agent messages and loads it with "before agent message 2"
- **THEN** the transcript shows customer 1, agent 1 and customer 2, labeled, and a completion request carries those three turns

#### Scenario: Load an Arabic conversation
- **WHEN** the user loads text with `العميل:` and `الموظف:` turns
- **THEN** the turns appear labeled as customer and agent, right to left

#### Scenario: Mixed text with a continued line
- **WHEN** an agent turn "Agent: أهلاً، سأساعدك في your Absher account" is followed by the line "وسأرسل لك رابط الـ reset."
- **THEN** the loaded agent turn holds both lines

#### Scenario: Choose among conversations
- **WHEN** the text holds two conversations separated by `---`
- **THEN** a list offers both, labeled by number and the start of their first message, and loading the second shows only its turns

#### Scenario: Whole conversation
- **WHEN** the user chooses "whole conversation"
- **THEN** every turn is loaded, including the last agent message

#### Scenario: Canned responses turned off
- **WHEN** a conversation is loaded while canned responses are on
- **THEN** the settings panel shows canned responses off, the next completion request has canned responses disabled, and the knowledge base setting is unchanged

#### Scenario: File read locally
- **WHEN** the user picks a text file
- **THEN** its text is read in the page, no network request is made, and it can be loaded like pasted text

#### Scenario: No labeled turns
- **WHEN** the user tries to load text without any role label
- **THEN** the page shows that no `Customer:` or `Agent:` turns were found, and the transcript is unchanged

#### Scenario: Parsers agree
- **WHEN** the shared chat-format fixture is parsed by the page's parser and by the local eval's parser
- **THEN** both give the same conversations, roles, texts and warnings for every entry, including the English, Arabic and mixed ones
