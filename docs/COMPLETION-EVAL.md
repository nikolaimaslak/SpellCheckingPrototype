# Evaluating inline completion

The local completion eval builds test sets from chat samples or plain text, runs them through the real completion program, and writes a report. Spec: `openspec/specs/completion-eval/`.

It is infrastructure: there's no gate, baseline or committed results. Compare reports by eye, for example before and after a prompt change.

## The workspace

Everything the tool reads and writes is under `eval/local/completion/`, which git ignores:

| Folder | Holds |
|---|---|
| `sources/` | Your input files (optional: a path anywhere also works) |
| `sets/<name>.jsonl` | Generated test sets, with `<name>.meta.json` (input, seed, options) |
| `runs/<time>-<set>-<model>/` | `samples.jsonl` (every answer), `report.md` and `report.json` |

**Inputs must be synthetic, public or redacted: no personal data.** A run sends each case's conversation and prefix to the configured model. With Gemini that's Google, and the run reminds you before it starts.

## Input formats

**Chat text (the default).** See `eval/completion/examples/chat-example.txt`, which covers English, Arabic and mixed text:
- A turn starts with `Customer:` or `Agent:`, or `العميل:` or `الموظف:`. Labels are case-insensitive, and spaces around the colon are allowed.
- A line without a label continues the previous turn.
- A line with only `---` ends a conversation.
- Lines starting with `#` are comments.
- Text before the first label is skipped, with a warning naming its line.

**Plain text (`--plain`):** every paragraph is an agent message with no conversation. Add `--split sentences` to make every sentence a message instead.

The demo page's **Load conversation…** control (under the chat) reads the same chat format, so you can load an eval input and try the model on it live. Loading turns canned responses off. See `docs/TESTING.md` T4b.

## Building a set

```sh
npm run eval:completion:build -- eval/completion/examples/chat-example.txt --name example
npm run eval:completion:build -- notes.txt --name notes --plain --split sentences   # file in eval/local/completion/sources/
```

Every agent message is cut at points in four categories. Each case keeps the agent's real text after the cut (`truth`) and the word at the cut (`truthWord`):

| Category | Cut | Example prefix |
|---|---|---|
| `mid-word` | Inside a word, at least 2 letters typed | "Your contribution rec" |
| `end-of-word` | Right after a word | "Your request" |
| `after-space` | Right after a space | "Your request " |
| `after-punctuation` | Right after `, : ; . ! ? ؟ ،`, before the following space | "Thank you," |

- **Which cuts count:** a cut is used only when the sentence typed so far has at least 3 words, as in the client's own rule, and some text follows it.
- **Options:**
  - `--per-category N`: cuts per category and message (default 1);
  - `--seed N`: same input, options and seed always give the same set (default 1);
  - `--limit N`: keep only the first N cases.

## Running a set

```sh
npm run eval:completion -- --set example
npm run eval:completion -- --set example --samples 5 --concurrency 4
```

- **Path:** the same program, settings and post-processing as the server, called in process. No server needs to be running.
- **Model:** the one the server would use (`COMPLETION_MODEL`, `GEMINI_API_KEY` from `.env` or the environment).
- **Context:** canned responses and the knowledge base are always off; the case's conversation is always sent.
- **Cache:** off, whatever `.env` says.
- **Options:** `--samples N` (default 3) and `--concurrency N` (default 4).
- **Errors:** failed and timed-out requests count as errors and don't stop the run.
- **Offline test model:** refused unless you pass `--allow-fake`, which is only for testing the tool.
- **Before starting**, the run prints the number of requests.

## The report

`report.md` (and `report.json`, with the same figures) shows the settings, then these figures for each language (`en`, `ar`, `mixed`, `all`) and each category:

| Metric | Meaning |
|---|---|
| Shown | Samples with a non-empty suggestion |
| Withheld (format) | Model output the server couldn't use |
| Errors | Failed or timed-out requests |
| Word completion correct | Of the shown samples: at `mid-word` cuts, the completed word equals the agent's real word (case and Arabic diacritics ignored); at `end-of-word` cuts, the suggestion doesn't join the finished word |
| Spacing errors | Of the shown samples: a space right after a space, or a letter or digit right after punctuation |

Latency p50 and p95 are shown for information.

The report then lists up to 30 wrong word completions and 30 spacing errors, each with the end of the prefix, the suggestion and the truth. It contains the set's text, which is another reason it stays local.

Word completion compares the suggestion with **what this agent actually wrote**, so it also counts valid alternatives as wrong:
- a different correct word, such as "تسجي" completed as "تسجيله" where the agent wrote "تسجيل";
- a cut word that is already a whole word, such as "حساب" followed by a new word where the agent continued to "حسابك";
- a misspelling in the agent's own message.

Read the examples before trusting a figure. A suggestion glued onto a finished word ("…and" + "I can help…") is a real error.

## Not covered

- **No gate or baseline.**
- **No LLM judge:** a suggestion that's good but differs from what the agent wrote isn't scored.
- **`eval/completion/cases.jsonl`** (the older hand-written set) isn't used by this tool.
