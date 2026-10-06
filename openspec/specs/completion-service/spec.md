# completion-service Specification

## Purpose

The server-side (Tier 2) service that predicts the rest of the agent's sentence from the live conversation and the service's canned responses. In the prototype it runs as a local stand-in for the Intelligence Engine, backed by a hosted model.

## Requirements

### Requirement: Completion endpoint contract
The service SHALL expose `POST /v1/complete`.
- **Request (JSON):** the agent's text before the caret (`prefix`), the recent transcript as `{ role: 'customer' | 'agent', text }` turns, and the enabled context sources.
- **Reply on success (JSON):** `{ completion, lang, latencyMs, model, sources }`, where `completion` is the text to append (possibly empty) and `sources` lists the identifiers of the canned responses used. When `completion` is non-empty, the reply MUST also carry `edit: { typed, word, rest }`: `typed` is the agent's unfinished word as the service read it (empty when the prefix ends with whitespace or punctuation), `word` its completed form, and `rest` what follows, so that `completion` equals `word` without its first `typed.length` characters, followed by `rest`.

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

### Requirement: Context assembly
The service SHALL build the model prompt from cheapest to most expensive:
1. the most recent transcript turns (always, when enabled);
2. up to 3 canned responses ranked by lexical similarity to the customer's last message and the prefix (when enabled);
3. up to 2 knowledge base passages, only when the customer's last message retrieves them with a score at or above a high-confidence threshold (when the `kb` source is enabled).

It MUST compare Arabic text with diacritics, tatweel and alef/hamza variants normalized for retrieval. The stable parts (instructions, canned snippets, knowledge base passages, transcript) MUST come before the prefix, so repeated requests share a prompt prefix. The reply's `sources` MUST identify the knowledge base passages used. The instructions MUST NOT forbid names, identifiers, amounts, figures, dates or timelines: the model may use any detail from the conversation, canned responses and knowledge base passages sent. They MUST tell the model to state facts, figures, dates and identifiers only as given in those sources, and not to invent policies or details that aren't in them. The instructions MUST describe the structured output: `word`, the last word of the agent's text written out in full, whether or not the agent finished it (empty when the agent's text ends with whitespace or punctuation), and `rest`, the continuation after it including its own leading space or punctuation. They MUST NOT ask for raw character fragments of a word.

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
- **WHEN** the instructions are built
- **THEN** they don't forbid names, identifiers, amounts, figures, dates or timelines, and they ask the model to use only details given in the conversation, canned responses or knowledge base passages sent

#### Scenario: Arabic and mixed details from the sources
- **WHEN** the customer wrote "رقم طلبي 4471 والبريد noura@example.com" and the agent typed "شكراً، سنرسل التحديث إلى"
- **THEN** the prompt carries the customer's message unredacted, and a suggestion containing "noura@example.com" is returned unchanged

#### Scenario: Instructions explain unfinished words
- **WHEN** the instructions are built
- **THEN** they ask for the whole current word in `word` and the continuation in `rest`, never a fragment of a word

#### Scenario: Whole word repeated by the model
- **WHEN** the prefix is "…you could have be" and the model returns `{ "word": "been", "rest": " easily confused." }`
- **THEN** the completion is "en easily confused."

### Requirement: Model call
The service SHALL select its model from `COMPLETION_MODEL`:
- `auto` (the default): Gemini when `GEMINI_API_KEY` is set, otherwise the offline test model;
- `gemini`: Gemini only, unavailable without a key;
- `fake`: the offline test model only.

It SHALL call Gemini (`gemini-3.5-flash-lite`) with low temperature, minimal reasoning, a short output limit and a request timeout. For completion, the call MUST request JSON output constrained by a response schema with the string fields `word` and `rest`; the offline test model MUST return the same shape. Grammar polish keeps its free-text call. The API key MUST be read from the server environment only, and MUST never appear in replies, logs or the repository. `GET /health` MUST report the active model, whether it sends text outside the machine, and the selection mode. There is no sourced-figures setting: `COMPLETION_SOURCED_FIGURES` is ignored.

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
- **WHEN** the service calls Gemini for a completion
- **THEN** the request asks for JSON with a response schema of `word` and `rest`, and no newline stop sequence cuts the JSON

### Requirement: Output assembly
The service SHALL turn the model output into a safe continuation: no repetition of the prefix, at most one sentence (cut after the first sentence terminator, which is `.`, `!`, `?` or `؟` followed by whitespace or the end of the text, so emails, links and decimals stay whole), at most 20 words, a single line, and in the same script as the prefix's last word, ignoring emails and links, which are written in Latin letters in either language. The model's output SHALL be parsed as `{ word, rest }`, and the suggestion assembled from it:
- **typed part:** the prefix's trailing run of letters, digits and marks; empty when the prefix ends with whitespace or punctuation;
- **with a typed part:** `word` MUST start with it (letter case ignored for the comparison) and MUST be longer than it, or equal to it when `rest` is non-empty; the suggestion is `word` without its first `typed.length` characters, followed by `rest`;
- **without a typed part:** the suggestion is `word` followed by `rest`. When the prefix ends in whitespace, the suggestion's leading whitespace MUST be removed; otherwise a leading space is added when the suggestion starts with a letter or digit;
- **the word is whole:** when `word` is non-empty, `rest` MUST be empty or start with whitespace or punctuation. A `rest` starting with a letter, digit or mark continues the word (a repeated fragment, a split-off Arabic suffix) and is not assembled.

Output that can't be parsed, whose `word` doesn't extend the typed part, or whose `rest` continues the word, MUST be returned as an empty completion with `withheld: "format"`; it MUST never be applied as a change to what the agent typed. No dictionary or vocabulary MUST be needed for this.

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
- **WHEN** the model's output isn't valid JSON of the expected shape
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
