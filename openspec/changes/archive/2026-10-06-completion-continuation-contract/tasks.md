# Tasks

## 1. Assembly (Tier 2)

- [x] 1.1 In `server/assist/postprocess.py`, replace `Structured`, `parse_structured` and `assemble` with `join(prefix, continuation)` (design 2):
  - first line only;
  - the echo drop when the continuation rewrites the unfinished word;
  - no leading whitespace after a space;
  - one space after punctuation;
  - then the unchanged `finalize`.

  Add `derive_edit(prefix, completion)`. Verify with `server/tests/test_postprocess.py`:
  - every "Continuation assembly" spacing and echo case: "proce" + "ssed…", "request" + " will…", "request " + "will…" and " will…", "form," + "today…", "proce" + "Processed yet.", "be" + "been easily confused.";
  - Arabic "تم استلا" + "م طلبك" and "حساب" + "ك.", and the mixed "your Absher acc" + "ount is locked.";
  - the unchanged `finalize` cases;
  - `derive_edit` for a join, a finished word, after a space and Arabic, with `completion == word[len(typed):] + rest` asserted for every case.

## 2. Program and offline model (Tier 2)

- [x] 2.1 In `server/assist/programs.py`, replace `CompleteSentence` with `ContinueText`: a single `continuation` output, and the per-case rules with English and Arabic examples (design 1). The other instructions stay unchanged and the organization name stays out. Update `CompletionProgram`. Verify with `server/tests/test_programs.py`:
  - the field order;
  - one output, `continuation`, typed `str`;
  - the instructions contain the four case rules and "Never repeat any part of `agent_text`";
  - parsing: a wrapped answer, a fenced answer, extra fields and a cut-off answer are read, and `5`, `null`, a list, a missing `continuation` and plain prose raise a parse error after exactly one call.
- [x] 2.2 Port `fake_completion` to return the continuation (design 3), and update `FakeCompletePredict`. Verify with `server/tests/test_fake.py`:
  - the assist-service offline scenarios: English "rec" → "eived and will…", Arabic "تم استلا" → "م طلبك…", and English after a space;
  - the existing fake cases, rewritten as continuations.
- [x] 2.3 Update the field name in `server/tests/test_lm.py` and `test_gemini_request.py`. Verify that the Gemini request's JSON schema has exactly `continuation` as its required property, with no stop sequences.

## 3. Endpoint (Tier 2)

- [x] 3.1 In `server/assist/complete.py`, make `build` use `join` and `derive_edit`. `withheld: "format"` comes only from a parse error. Update the module docstring. Verify with `server/tests/test_complete.py`, rewritten for continuations:
  - the tester-guide scenarios T4.2, T4.7, T4.14 and T4.17 with the offline model give the same completions as before;
  - a scripted `{"continuation": ""}` is an empty completion with no `withheld`;
  - a scripted prose answer is `format` and logs a `completion-withheld` event with the reason only;
  - the KB and source cases still pass.
- [x] 3.2 Update `server/tests/test_scenarios_en.py` for the new and changed English scenarios of `completion-service`, `assist-service` and `assist-telemetry`, and remove the tests of scenarios that no longer exist. Verify that the coverage check passes, and that every test is named after a scenario present in the merged specs (main plus delta).

## 4. Instruction tuning and live check

- [x] 4.1 Port the scratchpad comparison (`contracts.py`) to the new server code, as a throwaway script that isn't committed: 60 cases × 5 samples, cache off (`ASSIST_LLM_CACHE=off`). Run it, revise the punctuation rule and the empty-answer sentence once (design 4), and run it again. Record both runs in `live-check.md` in the change: shown, withheld, seam correct, spacing errors and p50, by language and category, next to the `word`/`rest` numbers measured the same day. Verify the acceptance in design 4. If it isn't met, stop and raise it with the user.
- [x] 4.2 Spot-check with Gemini the prefixes that failed on 2026-10-06 ("happ", "…nothing will h", "…your request ", "…تم استلا", "…فتح حساب", "…could have be", "…سأرسل لك التفا"), 3 samples each, and record the results in `live-check.md`.

## 5. Documentation

- [x] 5.1 Update `src/completion/README.md` ("Unfinished words: the structured edit" becomes the continuation contract and the derived `edit`), and the module docstrings. Verify that `grep -rn "word, rest\|{ word, rest }" src server/assist docs` finds only historical mentions.
- [x] 5.2 Update `docs/TESTING.md` T4.17 (a join is shown as the model wrote it; report a misspelled join, with the Arabic example), and add `KI-6` to `docs/known-issues.md`: the seam isn't checked, with the observed case and the mitigation options. Verify against design 5.

## 6. Integration

- [x] 6.1 Final gate: `npm test`, `npm run typecheck`, `npm run build` and `openspec validate completion-continuation-contract --strict` all pass. Then a manual check on the demo page with Gemini: in English, "Your contribution rec", "Thanks for waiting," and a prefix ending in a space; in Arabic, "شكراً لتواصلك معنا، تم استلا". Each shows ghost text that reads correctly. Restart the demo first, because it caches the old program.
