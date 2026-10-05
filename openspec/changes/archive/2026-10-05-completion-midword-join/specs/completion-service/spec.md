## MODIFIED Requirements

### Requirement: Context assembly
The service SHALL build the model prompt from cheapest to most expensive:
1. the most recent transcript turns (always, when enabled);
2. up to 3 canned responses ranked by lexical similarity to the customer's last message and the prefix (when enabled);
3. up to 2 knowledge base passages, only when the customer's last message retrieves them with a score at or above a high-confidence threshold (when the `kb` source is enabled).

It MUST compare Arabic text with diacritics, tatweel and alef/hamza variants normalized for retrieval. The stable parts (instructions, canned snippets, knowledge base passages, transcript) MUST come before the prefix, so repeated requests share a prompt prefix. The reply's `sources` MUST identify the knowledge base passages used, and the instructions MUST forbid amounts, numbers, dates, timelines, identifiers (such as reference numbers, email addresses and links) and people's names. When the sourced-figures setting is `allow`, the instructions MUST instead allow figures, dates and timelines only as worded verbatim in the canned responses or knowledge base passages sent. The instructions MUST still forbid policies that are not in the sources. The instructions MUST also say that, when the agent's text ends in the middle of a word, the output starts with the rest of that word without a space, and otherwise starts with a space.

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
- **THEN** they tell the model to continue an unfinished word without a space, and to start a new word with a space

### Requirement: Output post-processing
The service SHALL turn the model output into a safe continuation: no repetition of the prefix, at most one sentence (cut after the first sentence terminator), at most 20 words, a single line, and in the same script as the prefix's last word. When the prefix ends in whitespace, or the continuation doesn't start with a letter or digit, no space MUST be added. When the prefix ends inside a word (its last character is a letter or digit) and the continuation starts with a letter or digit, the service SHALL decide deterministically between joining (completing the unfinished word) and adding a space (starting a new word), in this order:
1. **Echoed word:** the continuation's first word starts with the unfinished word and is longer. The repeated part MUST be removed and the rest joined.
2. **Model said "new word":** the raw model output started with whitespace. A space MUST be added.
3. **Known joined word:** the unfinished word plus the continuation's first word is a word of the vocabulary. Join.
4. **Known unfinished word:** the unfinished word alone is a word of the vocabulary. A space MUST be added.
5. **Otherwise:** join.

The vocabulary is the words of the approved library (all canned responses and knowledge base articles), the conversation in the request and the prefix. Words are compared ignoring letter case, Arabic diacritics, tatweel and alef/hamza forms. Without a vocabulary, step 4 applies. Output failing these rules MUST be returned as an empty completion.

After that, a safety filter (formal Req 3.7) SHALL return an **empty** completion, never a shortened one, when the continuation contains any of the following:
- **figure:** a digit (Western or Arabic-Indic); an English number word from "two" upward ("zero", "two" … "twenty", the tens, "hundred", "thousand", "million", "billion", "dozen"); an Arabic number word ("صفر", "اثنان" … "عشرة", the tens, "مئة"/"مائة", "ألف", "مليون"), also with a leading و ف ب ل ك or ال; a currency ("SAR", "riyal", "ريال", "$", "﷼"); or a percentage ("%", "percent", "بالمئة");
- **date:** an English month name (capitalized; "May" only next to a digit) or weekday name; an Arabic Gregorian, Levantine or Hijri month name; an Arabic weekday with ال; "tomorrow", "yesterday", "tonight", "غداً", "غدا", "بكرة", "أمس"; or a time unit (day, week, month, year, hour, minute; يوم, أسبوع, شهر, سنة, ساعة, دقيقة and their plurals) in the same continuation as a relative word ("within", "next", "few", "couple", "several", "after"; "خلال", "القادم", "المقبل", "بعد", "عدة", "بضعة");
- **identifier:** an email address or a URL;
- **conversation:** a word of three or more letters from the customer's turns of this request that appears neither in the prefix nor anywhere in the approved library (every canned response and knowledge base article). Comparison ignores letter case, Arabic diacritics and tatweel.

When `COMPLETION_SOURCED_FIGURES` is `allow`, a continuation that would be dropped only for **figure** or **date** SHALL pass if the whole continuation, without its leading space and final punctuation, appears verbatim in one of the canned responses or knowledge base passages sent with this request (comparing whitespace, letter case, Arabic diacritics and tatweel loosely). Identifiers and conversation words MUST always be dropped. A dropped completion's reply MUST carry `withheld` with the first matching reason (`figure`, `date`, `identifier` or `conversation`) and never the dropped text. The filter MUST be deterministic and MUST run on the server, so no client can bypass it.

#### Scenario: Model repeats the prefix
- **WHEN** the model returns "your request will be processed soon." for the prefix "Thank you, your request"
- **THEN** the completion is " will be processed soon."

#### Scenario: Multiple sentences
- **WHEN** the model returns " will be processed. Anything else?"
- **THEN** the completion is " will be processed."

#### Scenario: Wrong language
- **WHEN** the prefix ends with an Arabic word and the model returns English
- **THEN** the completion is empty

#### Scenario: Figure from a canned response under the default setting
- **WHEN** the model returns " will be processed within 3 working days." and the setting is `block`
- **THEN** the completion is empty and the reply carries `withheld: "figure"`

#### Scenario: Arabic number word
- **WHEN** the model returns " وسيتم معالجته خلال ثلاثة أيام عمل" for an Arabic prefix and the setting is `block`
- **THEN** the completion is empty and the reply carries `withheld: "figure"`

#### Scenario: Timeline without a number
- **WHEN** the model returns " will be ready next week."
- **THEN** the completion is empty and the reply carries `withheld: "date"`

#### Scenario: Arabic month
- **WHEN** the model returns " اعتباراً من شهر رمضان" for an Arabic prefix
- **THEN** the completion is empty and the reply carries `withheld: "date"`

#### Scenario: Link
- **WHEN** the model returns " at www.gosi.gov.sa for details."
- **THEN** the completion is empty and the reply carries `withheld: "identifier"`

#### Scenario: Name from the conversation
- **WHEN** the customer wrote "Hello, this is Noura" and the model returns " Noura, we have received your request."
- **THEN** the completion is empty and the reply carries `withheld: "conversation"`

#### Scenario: Arabic name from the conversation
- **WHEN** the customer wrote "معك نوره من الرياض" and the model returns " يا نوره، تم استلام طلبك" for an Arabic prefix
- **THEN** the completion is empty and the reply carries `withheld: "conversation"`

#### Scenario: Conversation word that is also approved wording
- **WHEN** the customer wrote "my request is pending", the agent typed "Thank you, your", and the model returns " request has been received." ("request" is a customer word, but it also appears in the approved library)
- **THEN** the completion is returned unchanged

#### Scenario: Clean completion passes
- **WHEN** the model returns " has been received and is being reviewed." and the conversation has no other words
- **THEN** the completion is returned, and the reply carries no `withheld`

#### Scenario: Sourced figure allowed
- **WHEN** the setting is `allow`, the canned response "Your request has been received and will be processed within 3 working days; …" was sent, and the model returns " will be processed within 3 working days"
- **THEN** the completion is returned

#### Scenario: Paraphrased figure still blocked under allow
- **WHEN** the setting is `allow` and the model returns " will be done in 3 days." which is not verbatim in any source sent
- **THEN** the completion is empty and the reply carries `withheld: "figure"`

#### Scenario: Identifier blocked under allow
- **WHEN** the setting is `allow` and the model returns a sourced continuation that contains an email address
- **THEN** the completion is empty and the reply carries `withheld: "identifier"`

#### Scenario: Completing an unfinished word
- **WHEN** the prefix is "It hasn't been proce" and the model returns "ssed yet, but it is under review." (with "processed" in the approved library)
- **THEN** the completion is "ssed yet, but it is under review.", with no leading space

#### Scenario: Model repeats the unfinished word
- **WHEN** the prefix is "It hasn't been proce" and the model returns "processed yet, but it is under review."
- **THEN** the completion is "ssed yet, but it is under review."

#### Scenario: New word without a leading space from the model
- **WHEN** the prefix is "Thank you, your request" and the model returns "will be processed soon."
- **THEN** the completion is " will be processed soon.", because "request" is a known word

#### Scenario: Model marks a new word
- **WHEN** the prefix is "Please upload the form" and the model returns " today if possible."
- **THEN** the completion is " today if possible."

#### Scenario: Arabic unfinished word
- **WHEN** the prefix is "تم استلا" and the model returns "م طلبك وسيتم معالجته" (with "استلام" in the approved library)
- **THEN** the completion is "م طلبك وسيتم معالجته", joined without a space

#### Scenario: Unknown unfinished word
- **WHEN** the prefix ends with "Abshe", the model returns "r app now." without a leading space, and neither "Abshe" nor "Absher" is in the vocabulary
- **THEN** the completion is "r app now.", joined
