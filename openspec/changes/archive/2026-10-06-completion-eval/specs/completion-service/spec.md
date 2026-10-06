## MODIFIED Requirements

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
