## MODIFIED Requirements

### Requirement: Context assembly
The service SHALL build the model prompt from cheapest to most expensive:
1. the most recent transcript turns (always, when enabled);
2. up to 3 canned responses ranked by lexical similarity to the customer's last message and the prefix (when enabled);
3. up to 2 knowledge base passages, only when the customer's last message retrieves them with a score at or above a high-confidence threshold (when the `kb` source is enabled).

It MUST compare Arabic text with diacritics, tatweel and alef/hamza variants normalized for retrieval. The stable parts (instructions, canned snippets, knowledge base passages, transcript) MUST come before the prefix, so repeated requests share a prompt prefix. The reply's `sources` MUST identify the knowledge base passages used, and the instructions MUST forbid amounts, numbers, dates, timelines, identifiers (such as reference numbers, email addresses and links) and people's names. When the sourced-figures setting is `allow`, the instructions MUST instead allow figures, dates and timelines only as worded verbatim in the canned responses or knowledge base passages sent. The instructions MUST still forbid policies that are not in the sources. The instructions MUST also say that, when the agent's text ends in the middle of a word, the output starts by writing that whole word (which the post-processing then strips), and otherwise starts with a space.

#### Scenario: Canned response steers wording
- **WHEN** the customer asked about pension contribution status and a canned response about contribution status exists
- **THEN** that response is among the sources and appears in the prompt

#### Scenario: Arabic retrieval
- **WHEN** the customer wrote "استعلام عن الاشتراكات" and a canned response mentions "الإشتراكات"
- **THEN** the canned response is retrieved despite the hamza difference

#### Scenario: Sources disabled
- **WHEN** canned responses are disabled in the request
- **THEN** no canned response is retrieved or sent to the model

#### Scenario: Knowledge base used on a strong match
- **WHEN** the customer asks a question that strongly matches a knowledge base article about early retirement eligibility
- **THEN** a passage from that article is in the prompt, and its identifier is among the reply's sources

#### Scenario: Knowledge base skipped on a weak match
- **WHEN** the customer's last message only weakly matches any article (for example a greeting)
- **THEN** no knowledge base passage is sent to the model

#### Scenario: Knowledge base disabled
- **WHEN** the `kb` source is disabled in the request
- **THEN** no knowledge base passage is retrieved or sent

#### Scenario: Instructions under the default setting
- **WHEN** the server runs with the default sourced-figures setting
- **THEN** the instructions forbid amounts, numbers, dates, timelines, identifiers and names without exception

#### Scenario: Instructions explain unfinished words
- **WHEN** the instructions are built, under either sourced-figures setting
- **THEN** they tell the model to start by writing the whole unfinished word, and to start a new word with a space

#### Scenario: Whole word repeated by the model
- **WHEN** the prefix is "…you could have be" and the model follows the instructions with "been easily confused."
- **THEN** the completion is "en easily confused."
