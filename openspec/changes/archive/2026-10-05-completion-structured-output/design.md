# Design

## Context

Completion today:
1. `server/complete.ts` retrieves sources, builds the prompt (`server/prompt.ts`), and calls `model.complete(system, user, signal, opts)`, which returns raw text.
2. `postprocess(prefix, raw, isWord)` trims, removes a repeated prefix tail, strips an echoed unfinished word, cuts to one sentence and 20 words, checks the script, and decides join or space with a vocabulary.
3. `safetyCheck` runs.
4. The reply goes back as `{ completion, lang, latencyMs, model, sources, withheld? }`.

In the browser, `attachCompletion` optionally runs `checkWord` (`word-check.ts`), which `main.ts` backs with the spell service.

- **Gemini** (`server/models/gemini.ts`) sends `generationConfig` with temperature 0.2, `maxOutputTokens` 48, stop `\n` and minimal thinking. Gemini's REST API supports `responseMimeType: "application/json"` with a `responseSchema`.
- **The offline model** (`server/models/fake.ts`) slices a canned or KB text after the prefix's last token. It returns a polish fix when the system prompt starts with "You correct grammar".

## Goals / Non-Goals

**Goals:**
- One pure function turns `(prefix, { word, rest })` into a suggestion and an edit, or `format`, with no dictionary.
- The API reply carries the edit.
- Deleting the heuristics and the client check removes code rather than adding it.

**Non-Goals:**
- Prompt optimization (DSPy/Ax), polish, and request timing.

## Decisions

### D1. Structured generation option (Tier 2)

- `GenerationOptions` gains `responseSchema?: object`.
- When it's set, `gemini.ts` sends `responseMimeType: "application/json"` and the schema, and **omits** `stopSequences`, so a newline inside JSON can't cut it. `maxOutputTokens` defaults to 64 for structured calls (JSON keys plus the full word).
- The completion schema:

  ```json
  { "type": "OBJECT",
    "properties": { "word": { "type": "STRING" }, "rest": { "type": "STRING" } },
    "required": ["word", "rest"] }
  ```

  It's exported from `prompt.ts` as `COMPLETION_SCHEMA`.
- The fake model, when called with a `responseSchema`, returns `JSON.stringify({ word, rest })`:
  - it finds the prefix's trailing word fragment, case-insensitively, in the chosen canned or KB text;
  - `word` is that text's whole word at that spot, and `rest` is the text after it;
  - when the prefix ends in whitespace or punctuation, `word` is `''` and `rest` is the text after the last matched word.

  Polish keeps the free-text path.

### D2. `assemble` and `finalize` replace the join heuristics (Tier 2)

`server/postprocess.ts` exports two functions:
- **`parseStructured(raw)`** → `{ word, rest } | null`. It uses `JSON.parse` in a try/catch and requires string fields.
- **`assemble(prefix, { word, rest })`** → `{ completion, edit } | 'format'`:
  - `typed` is the prefix's trailing run of `[\p{L}\p{N}\p{M}]`, or `''` when the prefix ends otherwise;
  - **with `typed`:** require `word.toLowerCase().startsWith(typed.toLowerCase())` and (`word.length > typed.length` or `rest !== ''`). The completion is `word.slice(typed.length) + rest`;
  - **without `typed`:** the completion is `word + rest`, plus a leading space when the prefix doesn't end in whitespace and the completion starts with a letter or digit;
  - the edit is `{ typed, word, rest }`.

  Words are compared by code units after `toLowerCase`. Arabic has no case, so it's an exact comparison.
- **`finalize(prefix, completion)`** keeps the existing protections, without re-trimming the leading characters the assembly produced:
  - single line;
  - cut after the first sentence terminator;
  - 20 words;
  - script check on the first word;
  - removal of an exact repetition of the prefix's tail (a model that puts the whole typed phrase into `rest`).
- `complete.ts` runs: parse → `format` if null → assemble → `format` on failure → finalize → empty means nothing to add → `safetyCheck` → reply.
- When finalize truncates, `edit.rest` is recomputed from the final completion: `rest = completion.slice(word.length - typed.length)`.
- The old `postprocess` and the `isWord` and vocabulary plumbing in `complete.ts` are deleted. `libraryVocabulary` stays, because the safety filter's conversation check uses it.

- *Why lower-case only:* the agent's "Ollam" against "Ollama", or "proce" against "Processed", should match. Any other difference (another word) is a format failure, never an edit of the agent's text.
- *Alternative rejected:* letting the model also correct earlier words (`edit` with a range). Ghost text is append-only, and Req 3.3 forbids changing text without the agent's action.

### D3. Prompt (Tier 2)

The unfinished-word line is replaced by:
- "Return JSON with two fields. `word`: the last word of the agent's text, written out in full, whether or not the agent finished it (for example "Ollama" when the text ends with "Ollam", and "request" when it ends with "request"); an empty string only if the text ends with a space or punctuation. `rest`: the continuation after that word, starting with a space or punctuation as needed."

  The finished-word example was added after the first measurement: without it, Gemini answered `word: ""` after a finished word ("…your request" → `{ "word": "", "rest": " has been received." }`), which the assembly withholds as `format` (4 of 20 cases). The assembly rule stays strict; the prompt asks for the word instead.

The line "no repetition of what the agent already typed" becomes "Do not repeat earlier words the agent typed; only the current word goes in `word`." The safety and source lines stay.

### D4. Client cleanup (Tier 1)

- Delete `src/completion/word-check.ts` and its test.
- Remove `checkWord`, the withhold path, and the `completion-withheld`/`reason` additions from `controller.ts`.
- Remove the wiring from `main.ts`.
- Delete the controller tests for the check, and update the README.

The client still uses `completion`. `edit` is ignored by the demo client, but typed in `CompletionReply` (`src/completion/client.ts`) for other hosts.

### D5. Telemetry and measurement

- `telemetry.ts` adds `format` to `WITHHELD_REASONS`, keeping `spelling`. `onWithheld('format', lang)` is called from `complete.ts`.
- New `scripts/measure-completion.ts`, run manually: it reads a list of about 20 made-up cases `{ prefix, transcript?, expectWord }`, calls a running server's `/v1/complete`, and reports for each case:
  - whether a completion came back;
  - whether `prefix + completion` contains `expectWord` at the seam;
  - whether there's a stray space;
  - the latency;
  - plus totals and p50/p95.

  It's run before the code change and after it, against Gemini, with both outputs saved in the task notes.

### Undo, editable DOM, RTL

No client behavior changes beyond removing the check. Ghost text, undo and RTL handling are untouched. Arabic `word` and `rest` follow the same assembly.

## Risks / Trade-offs

- **Gemini returns valid JSON whose `word` isn't the current word** (for example the next word with an empty `typed` mismatch). → `format` withhold, measured by the script and counted on `/summary`. The prompt example steers it.
- **Latency increases.** JSON keys and the full word add output tokens. → Measured, p50/p95 before and after. If the increase is large, `maxOutputTokens` and the prompt length are the levers, and the result goes to SV's question 2.
- **Losing the dictionary safety net.** → Structured whole words remove the failure the check existed for. A word that doesn't extend the typed part is withheld deterministically.
