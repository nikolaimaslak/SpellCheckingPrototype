# Design

## Context

For motivation, see proposal.md. Everything is **Tier 2** (`server/assist/`). The browser and the HTTP replies don't change, and nothing touches undo, the editable DOM or RTL.

**Today:**
- `complete.py` calls the program, then `join` (`postprocess.py`) and `finalize`, which reject, empty or repair the answer without saying which rule fired.
- On a parse error, DSPy's `AdapterParseError` carries the model's text as `lm_response`, and the handler discards it.
- `polish.py`'s `safety_check` returns a sentence, not a code, and `clean_output` silently strips fences and quotes.
- The only trace is `on_withheld` writing `completion-withheld` (`format`) to the telemetry log.

## Decisions

### 1. Reasons from the rules themselves
- **`join`:** `join(prefix, continuation)` becomes a wrapper over `join_explained(prefix, continuation) -> (text, reasons)`. Each existing step appends its reason only when it changed something:
  - the first line kept → `multi-line`;
  - the echo dropped → `rewrote-word`;
  - the leading whitespace removed after a space → `space-after-space`;
  - a space added after punctuation → `missing-space`.
- **`finalize`:** becomes `finalize_explained` the same way:
  - the restated tail removed → `restated-prefix`;
  - the sentence cut → `multi-sentence`;
  - the 20-word cap → `too-long`;
  - nothing alphanumeric left → `nothing-left`;
  - the script check → `wrong-script`.
- **Unchanged:** the existing functions keep their signatures and return the same text, so the current tests prove that behavior didn't change.
- **Polish:** `safety_check` gains a code-returning companion that gives `protected-changed`, `length-changed` or `line-breaks-changed`; the existing messages stay as the reply's `reason`. `clean_output` reports `wrapped` when it removed a fence or quotes, and an empty model answer is `empty`.

### 2. One observation per request
Both handlers build an `Observation`:
- `endpoint`, `model`, `lang`, `reasons`;
- `input` (a dict of the program's inputs);
- `raw` (the parsed output field, `err.lm_response` on a parse error, or `None` on a timeout or failure);
- `output` (what the reply shows);
- `latencyMs`.

They hand it to an optional `observe(observation)` callback on `CompletionDeps` / `PolishDeps`. `empty-answer` is added when the raw continuation is blank. `on_withheld` stays as it is, so `completion-withheld` keeps working.

The **app's `observe`** does two things:
1. **Counters:** it appends `{type: "llm-request", endpoint, lang, model}` and one `{type: "llm-issue", endpoint, reason, lang, model}` per reason to the telemetry log. These are text-free, and the allowlist enforces it.
2. **Capture:** if `settings.capture` is `all`, or it's `errors` and there's a failure or repair reason, it appends the full observation, with an id, to `capture/llm.jsonl`.

The eval tool doesn't pass `observe`, so eval runs don't fill the capture log. Adding raw answers to eval samples is a possible follow-up.

### 3. Settings, files and reporting
- **Setting:** `ASSIST_CAPTURE` (`off` by default; `errors`, `all`; any other value is `off` with a warning). `/health` gains `capture`, and the startup line says "capture: errors (capture/ stores request and answer text)".
- **Files:** `capture/` is added to `.gitignore`. The writer creates the folder on first write and appends one line per record, with `ensure_ascii=False`.
- **Telemetry:**
  - `sanitize()` accepts `llm-request` and `llm-issue`, with the fields `endpoint` (`complete` or `polish`), `reason` (one of the allowlisted reasons; anything else is dropped), `lang` and `model`;
  - `summarize()` adds an `llm` block: requests, failure and repair rates, and counts per endpoint and reason;
  - `render_summary` shows it as an "LLM output issues" section.
- **Report:** `capture.py` also has `main()`. `npm run capture:report` runs `uv run --project server --locked python -m assist.capture` and writes `capture/report.md`.

## Risks / Trade-offs

- **Text in the capture log.** → Off by default, gitignored, documented as synthetic or redacted text only, and the startup line warns when it's on. Production use needs a retention decision.
- **Two counters for `format`** (`completion-withheld` and `llm-issue`). → Kept for compatibility. `/summary` labels them separately.
- **Overlapping reasons** (a cut sentence that then fails the script check). → All reasons that fired are listed. Failure takes precedence for the failure rate.
