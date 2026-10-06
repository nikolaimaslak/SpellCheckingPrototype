## MODIFIED Requirements

### Requirement: Context assembly
The service SHALL pass the model its context as the completion program's typed input fields, from cheapest to most expensive:
1. the conversation turns (always, when enabled): by default every turn the request carries; when `COMPLETION_MAX_TURNS` is set to a positive whole number, only that many of the most recent turns;
2. up to 3 canned responses ranked by lexical similarity to the customer's last message and the prefix (when enabled);
3. up to 2 knowledge base passages, only when the customer's last message retrieves them with a score at or above a high-confidence threshold (when the `kb` source is enabled).

**Retrieval:** Arabic text MUST be compared with diacritics, tatweel and alef/hamza variants normalized. Retrieval results (identifiers, ranking, thresholds) MUST be the same as the previous server's for the same request.

**Field order:** the stable fields (approved responses, knowledge base passages, conversation) MUST come before the agent's text, so repeated requests share a prompt prefix. A disabled or empty source MUST be sent as an empty field or left out, never filled with placeholder content.

**Sources:** the reply's `sources` MUST identify the canned responses and knowledge base passages used.

**Instructions, on details:**
- They MUST NOT forbid names, identifiers, amounts, figures, dates or timelines. The model may use any detail from the conversation, canned responses and knowledge base passages sent.
- They MUST tell the model to state facts, figures, dates and identifiers only as given in those sources, and not to invent policies or details that aren't in them.

**Instructions, on the output:**
- They MUST describe the structured output:
  - `word`: the last word of the agent's text, written out in full whether or not the agent finished it, and empty when the agent's text ends with whitespace or punctuation;
  - `rest`: the continuation after it, including its own leading space or punctuation.
- They MUST NOT ask for raw character fragments of a word.

#### Scenario: Canned response steers wording
- **WHEN** the customer asked about pension contribution status and a canned response about contribution status exists
- **THEN** that response is among the sources and is passed to the model in the approved-responses field

#### Scenario: Arabic retrieval
- **WHEN** the customer wrote "استعلام عن الاشتراكات" and a canned response mentions "الإشتراكات"
- **THEN** the canned response is retrieved despite the hamza difference

#### Scenario: Sources disabled
- **WHEN** canned responses are disabled in the request
- **THEN** no canned response is retrieved or sent to the model

#### Scenario: Knowledge base used on a strong match
- **WHEN** the customer asks a question that strongly matches a knowledge base article about early retirement eligibility
- **THEN** a passage from that article is passed to the model, and its identifier is among the reply's sources

#### Scenario: Knowledge base skipped on a weak match
- **WHEN** the customer's last message only weakly matches any article (for example a greeting)
- **THEN** no knowledge base passage is sent to the model

#### Scenario: Knowledge base disabled
- **WHEN** the `kb` source is disabled in the request
- **THEN** no knowledge base passage is retrieved or sent

#### Scenario: Same retrieval as before
- **WHEN** any request from the previous server's retrieval tests is sent, in English or Arabic
- **THEN** the same canned response and knowledge base identifiers are retrieved, in the same order

#### Scenario: Full conversation by default
- **WHEN** `COMPLETION_MAX_TURNS` is not set and the request carries 12 English turns
- **THEN** all 12 turns are passed to the model, oldest first

#### Scenario: Conversation limited by setting
- **WHEN** `COMPLETION_MAX_TURNS=6` and the request carries 12 English turns
- **THEN** only the last 6 turns are passed to the model, oldest first

#### Scenario: Stable fields first
- **WHEN** the completion program's input fields are listed in order
- **THEN** the approved responses, knowledge base and conversation come before the agent's text

#### Scenario: Instructions under the default setting
- **WHEN** the instructions are built
- **THEN** they don't forbid names, identifiers, amounts, figures, dates or timelines, and they ask the model to use only details given in the conversation, canned responses or knowledge base passages sent

#### Scenario: Arabic and mixed details from the sources
- **WHEN** the customer wrote "رقم طلبي 4471 والبريد noura@example.com" and the agent typed "شكراً، سنرسل التحديث إلى"
- **THEN** the conversation field carries the customer's message unredacted, and a suggestion containing "noura@example.com" is returned unchanged

#### Scenario: Instructions explain unfinished words
- **WHEN** the instructions are built
- **THEN** they ask for the whole current word in `word` and the continuation in `rest`, never a fragment of a word

#### Scenario: Whole word repeated by the model
- **WHEN** the prefix is "…you could have be" and the model returns `{ "word": "been", "rest": " easily confused." }`
- **THEN** the completion is "en easily confused."

### Requirement: Model call
The service SHALL run the typed completion program on the model selected by the service runtime (`assist-service`: `COMPLETION_MODEL`, `GEMINI_API_KEY`, `COMPLETION_API_BASE`), with that capability's call settings and a 2-second timeout. The program's outputs are the string fields `word` and `rest`, and every model, including the offline test model, MUST answer in that shape. Grammar polish uses its own typed program.

`GET /health` MUST report the active model, whether it sends text outside the machine, and the selection mode. There is no sourced-figures setting: `COMPLETION_SOURCED_FIGURES` is ignored.

#### Scenario: Key missing
- **WHEN** the server starts with the default mode and no `GEMINI_API_KEY`
- **THEN** it uses the offline test model, and `/health` reports it as not sending text externally

#### Scenario: Key present in auto mode
- **WHEN** the server starts with the default mode and a `GEMINI_API_KEY`
- **THEN** it uses Gemini, and `/health` reports that text is sent externally

#### Scenario: Gemini forced without a key
- **WHEN** the server starts with `COMPLETION_MODEL=gemini` and no key
- **THEN** it still serves telemetry, and `POST /v1/complete` answers HTTP 503 with a reason that says the model is unavailable

#### Scenario: Upstream failure or timeout
- **WHEN** the model call fails or exceeds the timeout
- **THEN** the endpoint answers HTTP 502 or 504 with a short reason, and the client shows no ghost text

#### Scenario: Health reports the safety setting
- **WHEN** the server starts, with or without `COMPLETION_SOURCED_FIGURES`
- **THEN** `/health` reports no sourced-figures setting, and completions are never withheld for figures, dates or identifiers

#### Scenario: Structured completion call
- **WHEN** the service calls a model that supports schema-constrained output for a completion
- **THEN** the request asks for output constrained to `word` and `rest`, and no stop sequence can cut it short

#### Scenario: Local model without code change
- **WHEN** `COMPLETION_MODEL` names a local provider-qualified model
- **THEN** completions for English and Arabic prefixes come from that model through the same program and the same post-processing

### Requirement: Output assembly
The service SHALL turn the model output into a safe continuation: no repetition of the prefix, at most one sentence (cut after the first sentence terminator, which is `.`, `!`, `?` or `؟` followed by whitespace or the end of the text, so emails, links and decimals stay whole), at most 20 words, a single line, and in the same script as the prefix's last word, ignoring emails and links, which are written in Latin letters in either language. The model's output SHALL be parsed as `{ word, rest }`, and the suggestion assembled from it:
- **typed part:** the prefix's trailing run of letters, digits and marks; empty when the prefix ends with whitespace or punctuation;
- **with a typed part:** `word` MUST start with it (letter case ignored for the comparison) and MUST be longer than it, or equal to it when `rest` is non-empty; the suggestion is `word` without its first `typed.length` characters, followed by `rest`;
- **without a typed part:** the suggestion is `word` followed by `rest`. When the prefix ends in whitespace, the suggestion's leading whitespace MUST be removed; otherwise a leading space is added when the suggestion starts with a letter or digit;
- **the word is whole:** when `word` is non-empty, `rest` MUST be empty or start with whitespace or punctuation. A `rest` starting with a letter, digit or mark continues the word (a repeated fragment, a split-off Arabic suffix) and is not assembled.

**Parsing the model's output:** the service SHALL read a JSON object from the output even when it is wrapped in other text or a code fence, is cut off after its last field, or carries extra fields (the extra fields are ignored). `word` and `rest` MUST both be present and MUST both be strings in the model's output: a number, list, object or null in either is not converted to text.

Output with no JSON object, with `word` or `rest` missing or not a string, whose `word` doesn't extend the typed part, or whose `rest` continues the word, MUST be returned as an empty completion with `withheld: "format"`; it MUST never be applied as a change to what the agent typed. No dictionary or vocabulary MUST be needed for this.

The service MUST NOT filter the assembled suggestion for its content: names, words from the conversation, identifiers (emails, links, reference numbers), amounts, figures, dates and timelines are returned as the model wrote them. The only reasons a non-empty model answer yields no suggestion are `format` and the checks above (one line, one sentence, 20 words, script).

#### Scenario: Model repeats the prefix
- **WHEN** the model returns `{ "word": "request", "rest": " will be processed soon." }` for the prefix "Thank you, your request" (repeating the agent's last word in full)
- **THEN** the completion is " will be processed soon."

#### Scenario: Multiple sentences
- **WHEN** the model returns `{ "word": "request", "rest": " will be processed. Anything else?" }` for the prefix "Thank you, your request"
- **THEN** the completion is " will be processed."

#### Scenario: Wrong language
- **WHEN** the prefix ends with an Arabic word and the model's `word` and `rest` are English
- **THEN** the completion is empty

#### Scenario: Completing an unfinished word
- **WHEN** the prefix is "It hasn't been proce" and the model returns `{ "word": "processed", "rest": " yet, but it is under review." }`
- **THEN** the completion is "ssed yet, but it is under review.", with no leading space, and `edit.typed` is "proce"

#### Scenario: Model repeats the unfinished word
- **WHEN** the prefix is "It hasn't been proce" and the model returns `{ "word": "Processed", "rest": " yet." }` (different letter case)
- **THEN** the completion is "ssed yet.", keeping the agent's typed letters as they are

#### Scenario: New word without a leading space from the model
- **WHEN** the prefix is "Thank you, your request " (ending in a space) and the model returns `{ "word": "", "rest": "will be processed soon." }`
- **THEN** the completion is "will be processed soon.", with no extra space

#### Scenario: Model marks a new word
- **WHEN** the prefix is "Please upload the form," and the model returns `{ "word": "", "rest": "today if possible." }`
- **THEN** the completion is " today if possible.", with the space added after the comma

#### Scenario: Arabic unfinished word
- **WHEN** the prefix is "تم استلا" and the model returns `{ "word": "استلام", "rest": " طلبك وسيتم معالجته" }`
- **THEN** the completion is "م طلبك وسيتم معالجته"

#### Scenario: Unknown unfinished word
- **WHEN** the prefix ends with "Abshe" and the model returns `{ "word": "Absher", "rest": " app now." }`, a word no dictionary or approved text contains
- **THEN** the completion is "r app now."

#### Scenario: Name from the conversation completed
- **WHEN** the customer wrote "How does Ollama work?", the agent typed "Before jumping into Ollam", and the model returns `{ "word": "Ollama", "rest": ", I can help you." }`
- **THEN** the completion is "a, I can help you." and nothing is withheld

#### Scenario: Word that doesn't extend what was typed
- **WHEN** the prefix is "…you could have be" and the model returns `{ "word": "seen", "rest": " helpful." }` or `{ "word": "", "rest": " n easily confused." }`
- **THEN** the completion is empty and the reply carries `withheld: "format"`

#### Scenario: Unparseable output
- **WHEN** the model's output contains no JSON object, or one without `word` or `rest`
- **THEN** the completion is empty and the reply carries `withheld: "format"`

#### Scenario: JSON wrapped in text
- **WHEN** the prefix is "Thank you, your request" and the model returns `Sure! {"word": "request", "rest": " will be processed soon."}` or the same object inside a ```json fence
- **THEN** the completion is " will be processed soon."

#### Scenario: Extra fields ignored
- **WHEN** the prefix is "Thank you, your request" and the model returns `{"word": "request", "rest": " will be processed soon.", "confidence": 0.9}`
- **THEN** the completion is " will be processed soon."

#### Scenario: Wrong field type
- **WHEN** the prefix is "Your order" and the model returns `{"word": "order", "rest": 5}` or `{"word": null, "rest": " ships today."}`
- **THEN** the completion is empty and the reply carries `withheld: "format"`

#### Scenario: Figures and dates returned
- **WHEN** the model returns `{ "word": "request", "rest": " will be processed within 3 working days." }` for the prefix "Thank you, your request"
- **THEN** the completion is " will be processed within 3 working days." and the reply carries no `withheld`

#### Scenario: Arabic timeline returned
- **WHEN** the model returns `{ "word": "", "rest": " وسيتم معالجته خلال ثلاثة أيام عمل." }` for the prefix "تم استلام طلبك،"
- **THEN** the completion is " وسيتم معالجته خلال ثلاثة أيام عمل." and the reply carries no `withheld`

#### Scenario: Identifiers kept whole
- **WHEN** the model returns `{ "word": "", "rest": " see www.gosi.gov.sa for details. Anything else?" }` for the prefix "Thank you,"
- **THEN** the completion is " see www.gosi.gov.sa for details."

#### Scenario: Email after an Arabic prefix
- **WHEN** the model returns `{ "word": "إلى", "rest": " noura@example.com." }` for the prefix "شكراً، سنرسل التحديث إلى"
- **THEN** the completion is " noura@example.com.": the email doesn't count as English for the script check

#### Scenario: Name and identifier from the conversation returned
- **WHEN** the customer wrote "Hello, this is Noura, my email is noura@example.com" and the model returns `{ "word": "", "rest": " Noura, we will write to noura@example.com." }` for the prefix "Thank you,"
- **THEN** the completion is " Noura, we will write to noura@example.com." and the reply carries no `withheld`

#### Scenario: Repeated fragment in rest
- **WHEN** the prefix is "I'll forward this to our technical depa" and the model returns `{ "word": "department", "rest": "rtment for assistance." }`
- **THEN** the completion is empty and the reply carries `withheld: "format"`

#### Scenario: Fragment kept as the word
- **WHEN** the prefix is "شكراً على صبرك، سأرسل لك التفا" and the model returns `{ "word": "التفا", "rest": "اصيل حالما تتوفر." }`
- **THEN** the completion is empty and the reply carries `withheld: "format"`

#### Scenario: Arabic suffix split off
- **WHEN** the prefix is "أهلاً بك، كيف يمكنني مسا" and the model returns `{ "word": "مساعدة", "rest": "ك اليوم؟" }`
- **THEN** the completion is empty and the reply carries `withheld: "format"`, rather than showing "مساعدةك"

#### Scenario: No double space after a space
- **WHEN** the prefix is "تم فتح ticket جديد. " and the model returns `{ "word": "", "rest": " وسيتواصل معك المختصون قريباً." }`
- **THEN** the completion is "وسيتواصل معك المختصون قريباً.", without the leading space
