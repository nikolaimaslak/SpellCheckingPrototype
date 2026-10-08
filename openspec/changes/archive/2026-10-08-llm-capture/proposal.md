# Proposal

## Why

When the model answers badly, we can't see it. The server silently rejects, empties or repairs the answer, and keeps nothing. The only trace is a `completion-withheld` count for unparseable output, with no text. So we can't:
- tell how often the model ignores an instruction (a rewritten word, a missing space, two sentences, the wrong language);
- see which inputs cause it;
- turn real failures into eval cases or prompt fixes.

The local eval showed the same gap: a "nothing shown" sample can't be told apart from an empty answer or from the server removing the text.

Serves **PER #60145** (completion) and **#60254** (grammar polish), formal Req 11 (reporting), **Phase 3–4**. It's the instrumentation for tuning the prompt, and later the local model.

## What Changes

- **Every completion and polish request gets a list of issue reasons:** the ways the model's output was wrong from our point of view.
  - **Failures** (nothing shown):
    - `format`: unparseable or wrong type;
    - `timeout`;
    - `failed`;
    - `wrong-script`;
    - `nothing-left`: everything was removed;
    - polish only: `empty`, `protected-changed`, `length-changed` and `line-breaks-changed`.
  - **Repairs** (shown after the server fixed it):
    - `multi-line`, `rewrote-word`, `space-after-space`, `missing-space`, `restated-prefix`, `multi-sentence` and `too-long`;
    - polish only: `wrapped` (a code fence or quotes removed).
  - **Informational:** `empty-answer`, where the model said there's nothing to add.
- **Text-free counters, always on:** the server writes one `llm-issue` event per reason to the telemetry log (endpoint, reason, language, model; no text). `/summary` shows failure and repair rates per endpoint and reason.
- **An opt-in capture log with text,** `ASSIST_CAPTURE=off|errors|all`, off by default. It writes `capture/llm.jsonl` (gitignored), one record per request, with:
  - the input sent (agent text, conversation, approved responses, knowledge base passages, or the draft);
  - the model's raw output;
  - what was shown;
  - the reasons and the latency.

  With `errors`, only requests with a failure or a repair are written. With `all`, every request is.
- **`npm run capture:report`** writes `capture/report.md`: counts per endpoint, reason and language, and examples for each reason (input end, raw output, what was shown).

## Non-goals

- **No change to what the agent sees.** The same rules reject, empty and repair as today; this change only records them.
- **No client-side stale counts** (answers dropped because the agent moved on), and **no agent outcome** (accepted or dismissed) linked to the capture. Both are possible later through a request id.
- **No automatic export to eval sets,** and no LLM judge.
- **No detection of a wrong join inside a word** (KI-6): the server has no dictionary.

## Capabilities

### New Capabilities
- `llm-capture`: issue reasons for completion and polish, the text-free counters, the opt-in capture log, the capture report, and the `/summary` section.

### Modified Capabilities
- `assist-telemetry`: **What is recorded** adds the `llm-issue` event (text-free, with allowlisted reasons).

## Impact

- **Code:**
  - `server/assist/postprocess.py` (`join` reports the repairs it made);
  - `server/assist/complete.py` and `polish.py` (collect the reasons, keep the raw output, call an observer);
  - a new `server/assist/capture.py` (writer and report CLI);
  - `server/assist/settings.py` (`ASSIST_CAPTURE`);
  - `server/assist/telemetry.py` (allowlist, summary section);
  - `server/assist/app.py` (wiring);
  - `.gitignore` (`/capture/`);
  - an npm script.
- **Data:** the counters hold no text. The capture log holds conversation and draft text, so it's off by default, local and gitignored, and for synthetic or redacted text only, like Gemini traffic. Using it with real customer data on the local model needs a retention decision first.
- **Dependencies:** none.
