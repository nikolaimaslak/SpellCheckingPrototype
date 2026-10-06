# Design

## Context

For motivation, see proposal.md.

The completion server is a Python `uv` project (`server/`, package `assist`). Its endpoint logic is a plain async function, `complete(body, deps)` in `assist/complete.py`, so an eval can call it in process with the same settings, model, adapter and post-processing as the server, and without HTTP.

The scratchpad scripts used this week (`contracts.py`, `compare.py`) proved the approach. This change makes it a tool.

This is all tooling. There are no runtime **tiers** involved: the browser (Tier 1) and the HTTP contract (Tier 2) don't change, and there's no interaction with undo, the editable DOM or RTL layout. Arabic and mixed text are handled in parsing, cutting and scoring, with tests in both languages.

## Goals / Non-Goals

**Goals:** one command to build a set, one to run it, with a readable report, all local. The code should be small enough to extend later, for example with a comparison or a gate.

**Non-goals:** see proposal.md. Additionally: no HTTP mode, no parallel runs across models, and no resuming interrupted runs.

## Decisions

### 1. Package and commands

```
server/assist_eval/
  __main__.py    CLI: build | run   (argparse)
  sources.py     chat-text and plain-text parsers → Conversation(turns)
  cases.py       cut points, categories, seeded selection → Case
  run.py         runs cases through assist.complete in process, writes samples.jsonl
  metrics.py     shown / withheld / errors / word completion / spacing, by language and category
  report.py      report.md and report.json
  paths.py       eval/local/completion/{sources,sets,runs}
server/tests/eval/   pytest, offline (fake model and the scripted LiteLLM double)
```

- **Packaging:** `pyproject.toml` lists `assist_eval` next to `assist`.
- **npm scripts:**
  - `eval:completion:build` runs `uv run --project server --locked python -m assist_eval build`;
  - `eval:completion` runs the same command with `run`.

  The arguments pass through after `--`.

**Alternative: an `eval` subpackage inside `assist`.** Rejected: it would ship eval code inside the server package.

### 2. Input parsing (`sources.py`)

- **Chat text:**
  - a line matching `^\s*(customer|agent|العميل|الموظف)\s*:\s*(.*)$` (case-insensitive) starts a turn;
  - other non-empty lines continue the current turn, joined with `\n`;
  - a `---` line closes the conversation, and `#` lines are skipped;
  - text before the first label is reported as a warning with its line number.
- **Roles:** `customer`/`العميل` maps to `customer`, and `agent`/`الموظف` maps to `agent`.
- **Plain text:** paragraphs (split on blank lines), each an agent message. `--split sentences` splits on `(?<=[.!?؟])\s+`.
- **Output:** a list of `Conversation`s, each a list of `Turn(role, text)` from `assist.programs`.

### 3. Cutting (`cases.py`)

For each agent message, with `transcript` = the turns before it:

1. **Find candidate cut offsets** by walking the characters:
   - `mid-word`: inside a run of letters, digits and marks, with at least 2 before the cut and 1 after;
   - `end-of-word`: the cut right after such a run, where the next character is whitespace or punctuation;
   - `after-space`: right after a whitespace that follows a word;
   - `after-punctuation`: right after one of `, : ; . ! ? ؟ ،` that is followed by whitespace in the message. The cut has no space typed yet, and requiring the whitespace excludes decimals, emails and links ("2.5", "gosi.gov.sa"). Corrected during implementation: an earlier draft said the opposite.
2. **Keep only eligible cuts:** the current sentence before the cut (text since the last `.!?؟` followed by whitespace, or since the start) has at least 3 words, and some non-space text follows the cut.
3. **Pick** up to `--per-category` cuts per category with `random.Random(f"{seed}:{source}:{conversation}:{message}")`. Seeding per message keeps the choices stable when other messages change.
4. **For each cut, record:**
   - `prefix = message[:cut]`;
   - `truth` = the rest up to and including the end of the sentence;
   - `truthWord` = the word spanning the cut (mid-word) or ending at it (end-of-word);
   - `lang`, from the scripts in the message: `mixed` if it has both Arabic and Latin letters;
   - `id = f"{set}:{conv}:{msg}:{category}:{cut}"`.

`--limit N` keeps the first N cases for quick runs.

### 4. Running (`run.py`)

- **Settings:** `load_settings({**os.environ, "ASSIST_LLM_CACHE": "off"})`, then `configure_cache(False)`, `build_lm(...)` and `build_programs(...)`, the same calls the app makes. `CompletionDeps` gets an empty library and empty KB, and every body sets `sources: {transcript: true, canned: false, kb: false}`. Either alone would do; both make "no canned, no KB" hold by construction.
- **Concurrency:** an asyncio semaphore around `complete(...)`, over cases × samples, with results written to `samples.jsonl` as they finish.
- **Refusals and reminders:** the run refuses the offline test model without `--allow-fake`, and prints the external reminder when `settings.model.external` is set.
- **Run folder:** `runs/<UTC timestamp>-<set>-<model name with / replaced>/`, created at the start.

### 5. Metrics (`metrics.py`)

All metrics are pure functions over `(case, sample)` pairs, grouped by language (`en`, `ar`, `mixed`, `all`) and category:
- **word completion correct:**
  - `mid-word`: `fold(edit.word) == fold(truthWord)`, where `fold` lowercases and removes Arabic diacritics and tatweel;
  - `end-of-word`: the completion doesn't start with a letter, digit or mark.
- **spacing error:** the prefix ends in whitespace and the completion starts with whitespace, or the prefix ends in punctuation and the completion starts with a letter or digit.

  The server already fixes both, so in practice this checks for regressions in `join`. That's intended.
- **Latency:** p50 and p95 over all samples, including errors.

### 6. Report (`report.py`)

- **`report.json`:** the settings and the metric tables.
- **`report.md`:**
  - the same tables;
  - "Wrong word completions" and "Spacing errors" sections, up to 30 examples each, every example with the prefix's last 40 characters, the suggestion and the truth.

The report contains text from the set. It stays local and gitignored.

### 7. Example input

`eval/completion/examples/chat-example.txt` is committed, synthetic, and holds three short conversations: English, Arabic and mixed. The docs point to it, and the tests build from it.

## Risks / Trade-offs

- **Real messages contain typos.** A `truthWord` misspelled by the agent counts a correct model completion as wrong. → It's visible in the report's examples, and inputs can be cleaned. Accepted for infrastructure.
- **The truth is one valid continuation of many.** "Shown" and the word and spacing metrics don't depend on the truth's wording, which is why these three were chosen.
- **Cost and time:** cases × samples model calls. → `--limit`, `--samples` and `--concurrency`. A run prints the request count before starting.
- **PII:** inputs could contain it. → The documented rule, the reminder for external models, and the gitignored workspace. There's no automatic scan (a non-goal).

## Migration Plan

This adds tooling only. `/eval/local/` goes into `.gitignore` before anything is written there. Rollback: delete the package and the scripts.
