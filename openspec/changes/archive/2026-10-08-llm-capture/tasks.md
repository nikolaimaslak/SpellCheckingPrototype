# Tasks

## 1. Reasons (Tier 2)

- [x] 1.1 Add `join_explained` and `finalize_explained` to `server/assist/postprocess.py`, keeping `join` and `finalize` as wrappers with unchanged output (design 1). Verify:
  - every existing `test_postprocess.py` case still passes;
  - new cases cover each completion reason in English, Arabic and mixed text: the spec scenarios "English rewritten word", "Several repairs", "Arabic wrong script", "Mixed prefix, missing space" and "Clean answer", plus `multi-line`, `restated-prefix`, `too-long` and `nothing-left`.
- [x] 1.2 In `server/assist/polish.py`, add the reason codes: `protected-changed`, `length-changed`, `line-breaks-changed`, `empty` and `wrapped`. The reply's `reason` text stays unchanged. Verify with `test_polish.py`: the "Polish protected content" scenario, the Arabic draft wrapped in quotes giving `wrapped`, and the existing cases unchanged.

## 2. Observation, counters, capture (Tier 2)

- [x] 2.1 Build an `Observation` in `complete.py` and `polish.py`, with the raw output, including `lm_response` on `format`, `empty-answer`, and timeout and failure reasons, and call the optional `observe` (design 2). Verify with `test_complete.py` / `test_polish.py` using the scripted model: the reasons, raw and output for a clean answer, a `format` answer with its raw text, a timeout, `empty-answer`, and a repaired answer.
- [x] 2.2 Add the `ASSIST_CAPTURE` setting, `/health` `capture`, the startup line, `.gitignore` `/capture/`, and `server/assist/capture.py` (the writer, design 3). Wire `observe` in `app.py` to the counters and the capture log. Verify with `test_app.py` / `test_capture.py`:
  - off by default: no `capture/` file, and the counters are still written;
  - `errors` writes only the failing English request, with its raw text;
  - `all` writes an Arabic record unchanged;
  - no record holds the key.
- [x] 2.3 Telemetry: allowlist `llm-request`/`llm-issue` (dropping unknown reasons), the `llm` block in `summarize`, and the `/summary` section. Verify with `test_telemetry.py`: an issue stored without text, an unknown reason dropped, and the "Summary rates" scenario (10 requests, 2 `format`, 3 `multi-sentence` → 20% failures, 30% repairs).

## 3. Report, docs, checks

- [x] 3.1 Add the `capture:report` CLI in `capture.py` and the npm script. Verify with `test_capture.py`: the "Report from captured failures" scenario, with counts and examples per reason.
- [x] 3.2 Docs:
  - `.env.example`: `ASSIST_CAPTURE`, with the text warning;
  - CLAUDE.md: the commands, and the capture rule under the hard constraints;
  - `docs/ARCHITECTURE.md`: the data-handling and server module rows;
  - `docs/TESTING.md`: a short scenario that turns capture on, makes a few requests and runs the report.

  Then run the final gate: `npm test`, `npm run typecheck`, `npm run build` and `openspec validate llm-capture --strict`. Then a live check with Gemini: `ASSIST_CAPTURE=errors`, run the local eval set or a few demo requests, run `npm run capture:report`, and look at the failures it lists.
