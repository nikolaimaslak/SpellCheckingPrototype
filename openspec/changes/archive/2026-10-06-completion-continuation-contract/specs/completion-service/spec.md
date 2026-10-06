## MODIFIED Requirements

### Requirement: Completion endpoint contract
The service SHALL expose `POST /v1/complete`.
- **Request (JSON):** the agent's text before the caret (`prefix`), the recent transcript as `{ role: 'customer' | 'agent', text }` turns, and the enabled context sources.
- **Reply on success (JSON):** `{ completion, lang, latencyMs, model, sources }`, where `completion` is the text to append (possibly empty) and `sources` lists the identifiers of the canned responses used. When `completion` is non-empty, the reply MUST also carry `edit: { typed, word, rest }`, derived by the service from the prefix and the completion, so that `completion` equals `word` without its first `typed.length` characters, followed by `rest`:
- `typed`: the prefix's trailing run of letters, digits and marks (empty when the prefix ends with whitespace or punctuation);
- `word`: `typed` followed by the completion's leading letters, digits and marks when the completion joins the word, otherwise `typed` itself;
- `rest`: the rest of the completion.

The client MUST reach the service through a configurable base URL, so it can be replaced without changing the client.

#### Scenario: Successful completion
- **WHEN** the client posts a prefix and transcript
- **THEN** the reply carries a completion string, its language, the service-side latency and the model name

#### Scenario: Nothing useful to add
- **WHEN** the model's output is empty or rejected by post-processing
- **THEN** the reply carries an empty completion with HTTP 200

#### Scenario: Structured edit in the reply
- **WHEN** the agent typed "Before jumping into Ollam" and the suggestion completes the word
- **THEN** the reply carries `completion: "a, I can help you."` and `edit: { typed: "Ollam", word: "Ollama", rest: ", I can help you." }`

#### Scenario: Edit after a finished word
- **WHEN** the agent typed "Thank you, your request" and the completion is " will be processed soon."
- **THEN** the reply carries `edit: { typed: "request", word: "request", rest: " will be processed soon." }`

#### Scenario: Edit after a space
- **WHEN** the agent typed "Thank you, your request " and the completion is "will be processed soon."
- **THEN** the reply carries `edit: { typed: "", word: "", rest: "will be processed soon." }`

#### Scenario: Arabic edit
- **WHEN** the agent typed "تم استلا" and the completion is "م طلبك."
- **THEN** the reply carries `edit: { typed: "استلا", word: "استلام", rest: " طلبك." }`

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
- They MUST describe the single output `continuation`: the text appended directly after the agent's text, with nothing added in between, so it starts exactly where the agent's text stops.
- They MUST state the rule for each way the agent's text can end, each with an English and an Arabic example:
  - in the middle of a word: start with the missing letters of that word, with no space;
  - with a complete word: start with a space, or with punctuation that belongs right after the word;
  - with a space: start directly with the next word, with no space;
  - with punctuation: start with a space, then the next word.
- They MUST tell the model never to repeat any part of the agent's text, and MUST NOT ask for the current word separately.

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
- **THEN** they describe `continuation` as text appended directly after the agent's text, and give the rule for a word in progress ("Your request is being proce" → "ssed today."), a complete word ("Your request" → " has been received."), a trailing space ("Your request " → "has been received.") and punctuation ("Thank you," → " we have received your request."), each with an Arabic example too

#### Scenario: Instructions forbid repetition
- **WHEN** the instructions are built
- **THEN** they tell the model never to repeat any part of the agent's text, and ask for no separate current word

#### Scenario: Whole word repeated by the model
- **WHEN** the prefix is "…you could have be" and the model returns `{ "continuation": "been easily confused." }`, writing the unfinished word again from its start
- **THEN** the completion is "en easily confused."

### Requirement: Model call
The service SHALL run the typed completion program on the model selected by the service runtime (`assist-service`: `COMPLETION_MODEL`, `GEMINI_API_KEY`, `COMPLETION_API_BASE`), with that capability's call settings and a 2-second timeout. The program's output is the string field `continuation`, and every model, including the offline test model, MUST answer in that shape. Grammar polish uses its own typed program.

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
- **THEN** the request asks for output constrained to `continuation`, and no stop sequence can cut it short

#### Scenario: Local model without code change
- **WHEN** `COMPLETION_MODEL` names a local provider-qualified model
- **THEN** completions for English and Arabic prefixes come from that model through the same program and the same post-processing

## REMOVED Requirements

### Requirement: Output assembly
**Reason**: It assembled the suggestion from the model's `{ word, rest }` answer and withheld the answer when the boundary between the two was wrong, which the model got wrong often (18–30% of requests withheld as `format`). The model now returns one `continuation`.
**Migration**: Replaced by "Continuation assembly": spacing-only assembly, the unfinished word written again is dropped, the existing one-line, one-sentence, 20-word, script and restated-tail checks stay, and `format` means unusable output only. A seam the model joins wrongly is now shown as written (a known limitation).

## ADDED Requirements

### Requirement: Continuation assembly
The service SHALL turn the model's `continuation` into a safe suggestion.

**Parsing:** the service SHALL read a JSON object from the model's output even when it is wrapped in other text or a code fence, is cut off after its last field, or carries extra fields (which are ignored). `continuation` MUST be present and MUST be a string in the model's output: a number, list, object or null is not converted to text. Output with no JSON object, or with `continuation` missing or not a string, MUST be returned as an empty completion with `withheld: "format"`. That is the only reason for `format`.

**Spacing at the seam**, by how the prefix ends:
- **with whitespace:** the continuation's leading whitespace MUST be removed;
- **with punctuation** (neither a letter, digit or mark, nor whitespace): a space MUST be added when the continuation starts with a letter or digit;
- **with a letter, digit or mark:** the continuation MUST be kept as written. Starting with a letter, digit or mark, it joins the agent's word; starting with a space or punctuation, it follows the finished word.

**The unfinished word written again:** when the prefix ends with a run of letters, digits and marks, and the continuation starts with that same run (letter case ignored) followed by at least one more letter, digit or mark, the model has rewritten the word from its start, and the repeated run MUST be dropped. "proce" + "processed yet." becomes "ssed yet.".

**Then, as before:** no restating of the prefix's tail, at most one sentence (cut after the first `.`, `!`, `?` or `؟` followed by whitespace or the end of the text, so emails, links and decimals stay whole), at most 20 words, a single line, and the same script as the prefix's last word, ignoring emails and links. An empty result is an empty completion without `withheld`.

**No check of the completed word:** the service MUST NOT check the word formed at the seam against a dictionary or vocabulary. A join the model got wrong (a doubled or dropped letter) is shown as written. This is a known limitation.

**No content filter:** names, words from the conversation, identifiers (emails, links, reference numbers), amounts, figures, dates and timelines are returned as the model wrote them.

#### Scenario: Completing an unfinished word
- **WHEN** the prefix is "It hasn't been proce" and the model returns `{ "continuation": "ssed yet, but it is under review." }`
- **THEN** the completion is "ssed yet, but it is under review.", with no leading space, and `edit.word` is "processed"

#### Scenario: Continuing after a finished word
- **WHEN** the prefix is "Thank you, your request" and the model returns `{ "continuation": " will be processed soon." }`
- **THEN** the completion is " will be processed soon."

#### Scenario: Next word after a space
- **WHEN** the prefix is "Thank you, your request " and the model returns `{ "continuation": "will be processed soon." }`
- **THEN** the completion is "will be processed soon."

#### Scenario: Leading space after a space removed
- **WHEN** the prefix is "Thank you, your request " and the model returns `{ "continuation": " will be processed soon." }`
- **THEN** the completion is "will be processed soon.", with no double space

#### Scenario: Space added after punctuation
- **WHEN** the prefix is "Please upload the form," and the model returns `{ "continuation": "today if possible." }`
- **THEN** the completion is " today if possible."

#### Scenario: Model rewrites the unfinished word
- **WHEN** the prefix is "It hasn't been proce" and the model returns `{ "continuation": "Processed yet." }`
- **THEN** the completion is "ssed yet.", keeping the agent's typed letters as they are

#### Scenario: Model repeats the prefix
- **WHEN** the prefix is "Thank you, your request " and the model returns `{ "continuation": "your request will be processed soon." }`
- **THEN** the completion is "will be processed soon."

#### Scenario: Multiple sentences
- **WHEN** the prefix is "Thank you, your request" and the model returns `{ "continuation": " will be processed. Anything else?" }`
- **THEN** the completion is " will be processed."

#### Scenario: Wrong language
- **WHEN** the prefix ends with an Arabic word and the model's continuation is English
- **THEN** the completion is empty

#### Scenario: Unknown unfinished word
- **WHEN** the prefix ends with "Abshe" and the model returns `{ "continuation": "r app now." }`
- **THEN** the completion is "r app now."

#### Scenario: Name from the conversation completed
- **WHEN** the customer wrote "How does Ollama work?", the agent typed "Before jumping into Ollam", and the model returns `{ "continuation": "a, I can help you." }`
- **THEN** the completion is "a, I can help you." and nothing is withheld

#### Scenario: Join shown as the model wrote it
- **WHEN** the prefix is "I will send you the detai" and the model returns `{ "continuation": "ils soon." }`
- **THEN** the completion is "ils soon." (reading "detaiils"): the seam is not checked against a dictionary

#### Scenario: Nothing to add
- **WHEN** the model returns `{ "continuation": "" }`
- **THEN** the completion is empty and the reply carries no `withheld`

#### Scenario: Unparseable output
- **WHEN** the model's output contains no JSON object, or one without `continuation`
- **THEN** the completion is empty and the reply carries `withheld: "format"`

#### Scenario: JSON wrapped in text
- **WHEN** the prefix is "Thank you, your request" and the model returns `Sure! {"continuation": " will be processed soon."}` or the same object inside a ```json fence
- **THEN** the completion is " will be processed soon."

#### Scenario: Extra fields ignored
- **WHEN** the prefix is "Thank you, your request" and the model returns `{"continuation": " will be processed soon.", "confidence": 0.9}`
- **THEN** the completion is " will be processed soon."

#### Scenario: Wrong field type
- **WHEN** the prefix is "Your order" and the model returns `{"continuation": 5}` or `{"continuation": null}`
- **THEN** the completion is empty and the reply carries `withheld: "format"`

#### Scenario: Figures and dates returned
- **WHEN** the model returns `{ "continuation": " will be processed within 3 working days." }` for the prefix "Thank you, your request"
- **THEN** the completion is " will be processed within 3 working days." and the reply carries no `withheld`

#### Scenario: Identifiers kept whole
- **WHEN** the model returns `{ "continuation": " see www.gosi.gov.sa for details. Anything else?" }` for the prefix "Thank you,"
- **THEN** the completion is " see www.gosi.gov.sa for details."

#### Scenario: Name and identifier from the conversation returned
- **WHEN** the customer wrote "Hello, this is Noura, my email is noura@example.com" and the model returns `{ "continuation": " Noura, we will write to noura@example.com." }` for the prefix "Thank you,"
- **THEN** the completion is " Noura, we will write to noura@example.com." and the reply carries no `withheld`

#### Scenario: Arabic unfinished word
- **WHEN** the prefix is "تم استلا" and the model returns `{ "continuation": "م طلبك وسيتم معالجته" }`
- **THEN** the completion is "م طلبك وسيتم معالجته"

#### Scenario: Arabic suffix joined
- **WHEN** the prefix is "أهلاً، سأساعدك في فتح حساب" and the model returns `{ "continuation": "ك." }`
- **THEN** the completion is "ك." and `edit.word` is "حسابك"

#### Scenario: Arabic join shown as the model wrote it
- **WHEN** the prefix is "شكراً على صبرك، سأرسل لك التفا" and the model returns `{ "continuation": "اصيل قريباً." }`
- **THEN** the completion is "اصيل قريباً." (reading "التفااصيل"): the seam is not checked against a dictionary

#### Scenario: Arabic timeline returned
- **WHEN** the model returns `{ "continuation": " وسيتم معالجته خلال ثلاثة أيام عمل." }` for the prefix "تم استلام طلبك،"
- **THEN** the completion is " وسيتم معالجته خلال ثلاثة أيام عمل." and the reply carries no `withheld`

#### Scenario: Email after an Arabic prefix
- **WHEN** the model returns `{ "continuation": " noura@example.com." }` for the prefix "شكراً، سنرسل التحديث إلى"
- **THEN** the completion is " noura@example.com.": the email doesn't count as English for the script check

#### Scenario: No double space after a space
- **WHEN** the prefix is "تم فتح ticket جديد. " and the model returns `{ "continuation": " وسيتواصل معك المختصون قريباً." }`
- **THEN** the completion is "وسيتواصل معك المختصون قريباً.", without the leading space

#### Scenario: Mixed Arabic and English word joined
- **WHEN** the prefix is "مرحبا، your Absher acc" and the model returns `{ "continuation": "ount is locked." }`
- **THEN** the completion is "ount is locked." and `edit.word` is "account"
