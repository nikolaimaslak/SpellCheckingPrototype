# llm-capture Specification

## Purpose
Records how the language model's output fell short of what the service needs, for completion and grammar polish: a reason for every failure or repair, kept as text-free counters, and optionally with the input and the model's raw output in a local capture log, so prompt and model problems can be found and fixed.

## Requirements

### Requirement: Issue reasons
The service SHALL attach to every completion and polish request the list of issue reasons that apply. A request can have several.

**Completion failures** (the reply is an empty completion or an error):
- `format`: no usable JSON or a wrong type;
- `timeout`;
- `failed`: any other model error;
- `wrong-script`: a suggestion in another script than the prefix's last word;
- `nothing-left`: a non-empty answer reduced to nothing by the checks below.

**Completion repairs** (the suggestion is shown after the server changed it):
- `multi-line`: text after a line break dropped;
- `rewrote-word`: the unfinished word written again from its start, so the repeat was dropped;
- `space-after-space`: a leading space after a space removed;
- `missing-space`: a space added after punctuation;
- `restated-prefix`: the prefix's last words repeated, so the repeat was removed;
- `multi-sentence`: cut after the first sentence;
- `too-long`: cut at 20 words.

**Completion, informational:** `empty-answer`, where the model returned an empty continuation. It's neither a failure nor a repair.

**Polish failures** (the draft is returned unchanged):
- `format`, `timeout`, `failed`;
- `empty`: the model returned nothing;
- `protected-changed`: a placeholder, link, email or number changed;
- `length-changed`: outside 70–130% of the draft;
- `line-breaks-changed`.

**Polish repair:** `wrapped`, where a code fence or surrounding quotes were removed.

The reasons MUST NOT change what is shown to the agent: they describe the existing rules, they don't add any.

#### Scenario: English rewritten word
- **WHEN** the prefix is "It hasn't been proce" and the model returns "Processed yet."
- **THEN** the completion is "ssed yet." and the reasons are `rewrote-word`

#### Scenario: Several repairs
- **WHEN** the prefix is "Thank you, your request " and the model returns " will be processed. Anything else?"
- **THEN** the completion is "will be processed." and the reasons are `space-after-space` and `multi-sentence`

#### Scenario: Arabic wrong script
- **WHEN** the prefix is "تم استلام طلبك" and the model returns " and will be processed."
- **THEN** the completion is empty and the reasons are `wrong-script`

#### Scenario: Mixed prefix, missing space
- **WHEN** the prefix is "شكراً، سأرسل الرابط to your email," and the model returns "today."
- **THEN** the completion is " today." and the reasons are `missing-space`

#### Scenario: Clean answer
- **WHEN** the prefix is "Thank you, your request" and the model returns " will be processed soon."
- **THEN** the reasons list is empty

#### Scenario: Polish protected content
- **WHEN** the draft "Dear $(user.firstName), your request is ready." comes back as "Dear user, your request is ready."
- **THEN** the draft is returned unchanged and the reasons are `protected-changed`

#### Scenario: Arabic polish wrapped in quotes
- **WHEN** an Arabic draft comes back wrapped in quotes
- **THEN** the quotes are removed as before, and the reasons include `wrapped`

### Requirement: Issue counters
For every reason on a request, the service SHALL append one `llm-issue` event to the telemetry log, holding:
- the endpoint (`complete` or `polish`);
- the reason;
- the language;
- the model name;
- the timestamp.

It MUST hold no text from the request or the answer. These counters are always on.

`/summary` SHALL show, per endpoint:
- the number of requests;
- the failure rate and the repair rate;
- a count per reason.

Requests are counted from a text-free `llm-request` event written for every request.

#### Scenario: Counters without text
- **WHEN** a completion is repaired for `rewrote-word`
- **THEN** the log gains an `llm-request` event and an `llm-issue` event with reason `rewrote-word`, and neither holds the prefix, the conversation or the answer

#### Scenario: Summary rates
- **WHEN** the log has 10 completion requests, 2 with `format`, and 3 with `multi-sentence`
- **THEN** `/summary` shows a 20% completion failure rate, a 30% repair rate, and the count per reason

### Requirement: Opt-in capture log
`ASSIST_CAPTURE` SHALL select the capture log:
- `off` (the default) writes nothing;
- `errors` writes one record per request with at least one failure or repair reason;
- `all` writes one record per request.

Records go to `capture/llm.jsonl` at the repository root, which version control ignores. Each record holds:
- an id, the timestamp, the endpoint, the model, the language and the reasons;
- the input sent: the agent's text, the conversation, the approved responses and knowledge base passages; or the draft;
- the model's raw output: the parsed field, or the unparseable text for `format`; empty for `timeout` or `failed`;
- what was shown: the completion, or the polished text;
- the latency.

It MUST NOT hold the API key. `/health` SHALL report the capture setting, and the server's startup line SHALL say when capture is on and that it stores text.

#### Scenario: Off by default
- **WHEN** the service handles requests with no `ASSIST_CAPTURE` set
- **THEN** no `capture/` file is written, and the counters are still recorded

#### Scenario: Errors only
- **WHEN** `ASSIST_CAPTURE=errors` and one English request is clean while another is `format`
- **THEN** only the `format` request is written, with the unparseable text as its raw output

#### Scenario: Arabic record
- **WHEN** `ASSIST_CAPTURE=all` and an Arabic completion is handled
- **THEN** its record holds the Arabic prefix, the conversation, the model's continuation and the shown completion, unchanged

### Requirement: Capture report
`npm run capture:report` SHALL read `capture/llm.jsonl` and write `capture/report.md` with:
- the number of records per endpoint and language;
- the count of each reason;
- up to 10 examples per reason, each with the end of the input (the last 60 characters of the agent's text or the draft), the raw output and what was shown.

#### Scenario: Report from captured failures
- **WHEN** the log holds 3 `format` and 2 `multi-sentence` English completions and 1 `protected-changed` polish
- **THEN** the report shows those counts, and examples under each reason with the input end, the raw output and the shown text
