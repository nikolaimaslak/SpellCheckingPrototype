# Tasks

## 0. Baseline measurement

- [x] 0.1 Write `scripts/measure-completion.ts` (design D5), with about 20 made-up cases: mid-word EN ("be"→been, "proce"→processed, "Ollam" with a transcript, "rec"→records), whole-word EN, after a comma, mid-word AR ("استلا"→استلام), and whole-word AR. Run it against the current server (Gemini, `allow`) and save the output as the "before" in the task notes. Verify that the script runs and reports per-case results plus p50/p95.

## 1. Structured model call (Tier 2)

- [x] 1.1 Add `responseSchema` to `GenerationOptions`, and to the Gemini request (JSON mime type, no stop sequences, a default of 64 tokens), plus `COMPLETION_SCHEMA` in `prompt.ts` (design D1). Verify with `test/server/gemini.test.ts`: a structured call sends `responseMimeType`, the schema and no `stopSequences`; a plain call (polish) is unchanged; the key never appears in errors.
- [x] 1.2 Make the offline model return `{ word, rest }` JSON when given a schema (design D1). Verify with tests: "Thank you, your request" → `{ word: "request", rest: " has been received…" }`; "It hasn't been proce" with the first scenario message → `{ word: "processed", rest: " within 3 working days…" }`; a prefix ending in a space → `word: ""`; polish is unchanged.
- [x] 1.3 Rewrite the completion instructions for the structured task (design D3). Verify with `test/server/prompt.test.ts`: both modes describe `word` and `rest` with the "Ollam"/"Ollama" example, no longer contain "begin with the rest of that word" or "start by writing that whole word", and keep the safety lines.

## 2. Assembly and validation (Tier 2)

- [x] 2.1 Replace the join heuristics in `server/postprocess.ts` with `parseStructured`, `assemble` and `finalize` (design D2). Verify with `test/server/postprocess.test.ts`, covering every "Output post-processing" scenario in the delta:
  - request + " will be processed…" → " will be processed.";
  - proce + Processed → "ssed yet.";
  - ending in a space + `word: ""`;
  - ending in a comma → leading space;
  - استلا → "م طلبك…";
  - Abshe → "r app now.";
  - "be" + "seen" → format; `word: ""` with a typed part → format;
  - invalid JSON → format;
  - the wrong script → empty;
  - 20 words; one sentence.
- [x] 2.2 Wire it into `server/complete.ts`: `edit` in the reply (recomputed after `finalize`), `withheld: "format"`, `onWithheld('format')`, and the `isWord` and vocabulary plumbing removed. Add `edit` and `format` to `server/types.ts`. Verify with `test/server/complete.test.ts`:
  - "Before jumping into Ollam" with a fixed model returning `{ word: "Ollama", rest: ", I can help you." }` → `completion` "a, I can help you." with that `edit` and nothing withheld;
  - the offline-model mid-word replay;
  - a format failure is withheld and reported;
  - the existing safety and tester-guide replays still pass, updated to the structured fake.

## 3. Client cleanup (Tier 1)

- [x] 3.1 Remove the first-word check (design D4): delete `src/completion/word-check.ts` and its test, and remove `checkWord`, the withhold path and the event additions from `controller.ts`, plus the wiring in `main.ts`. Add `edit?` to the client's `CompletionReply` type. Verify that the controller tests still pass (with the check-specific ones removed), and the typecheck too.

## 4. Telemetry and docs

- [x] 4.1 Add `format` to the withheld reasons in `server/telemetry.ts`. Verify with `test/server/telemetry.test.ts`: `sanitize` keeps `format`, and the summary counts 4 `format`.
- [x] 4.2 Update `src/completion/README.md` (structured contract, the `edit` field, no word check), `docs/TESTING.md` (T4.17 wording; the T8.1 reasons gain `format`) and `docs/requirements/gap-analysis-60145-60254.md` (Req 3.1: mid-word suggestions via structured output). Verify that they match the delta specs.

## 5. Integration

- [x] 5.1 Restart the demo (Gemini, `allow`), run `scripts/measure-completion.ts` again, and save the "after" with a short before/after comparison of correct seams, withheld counts and p50/p95 in the task notes.
- [x] 5.2 Run `npm run typecheck`, `npm test` and `npm run build`. Verify that all pass.
- [x] 5.3 Run `openspec validate completion-structured-output --strict`. Verify that it passes.

## Notes

Measurement (`node scripts/measure-completion.ts`, Gemini `gemini-3.5-flash-lite`, `COMPLETION_SOURCED_FIGURES=allow`, 20 made-up cases: 12 that end mid-word and 8 that end in a finished word or punctuation; 2026-10-05):

| | Before (free text) | After, first prompt | After, final prompt (2 runs) |
|---|---|---|---|
| Correct seam | 18/20 | 16/20 | 20/20, 20/20 |
| Wrong seam ("be" → " n") | 1 | 0 | 0 |
| Withheld | 1 `figure` ("proce") | 4 `format` | 0 |
| Latency p50 / p95 | 536 / 848 ms | 718 / 1103 ms | 815 / 1225 ms, 717 / 920 ms |

- **First prompt:** after a finished word ("…your request", "…the delay", "…please", "…طلبك"), Gemini answered `{ "word": "", "rest": " has been received." }`. The strict assembly withholds that as `format`. The user chose to keep the rule strict and fix the prompt instead: `word` is the last word "whether or not the agent finished it", with the example "request" (design D3).
- **Latency:** structured output adds about 100–200 ms at p50, from the JSON keys and the full word. This is the first data point for SV's question 2.
- **Not a seam problem, left as is:** after "Your request has been received. " the model once restated that sentence. The prefix-tail removal doesn't match across the period.
