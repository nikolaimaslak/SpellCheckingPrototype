# Known issues

KI-1 to KI-5 were about the Hunspell engine, the misspellings lists and the spelling benchmark, all removed when spelling moved to the model.

## KI-6: A completion's join inside a word isn't checked

**Status:** open, accepted October 6, 2026 in the `completion-continuation-contract` change.

**What happens.** Inline completion asks the model for the text that goes right after the caret. When the agent stops mid-word, the model writes the missing letters, and the page shows them as written: it doesn't check the completed word against a dictionary. A model that repeats or drops a letter at the join produces a misspelled word in the ghost text. The agent's own letters are never changed, and accepting the suggestion is still the agent's choice.

**Evidence.** In the live check with `gemini-3.5-flash-lite` (60 cases × 5 samples), 96.5% of shown mid-word joins read correctly. The errors were all repeated letters in Arabic: "التفا" + "اصيل" ("التفااصيل") and "المرو" + "ُرور" ("المروُرور"). An earlier run also had one English drop: "Leib" + "n…" for "Leibniz". The numbers are in the change's `live-check.md`.

**Options when this is addressed:**
1. **Ask the model for the whole current word** in the same check request and show only what follows the typed letters, dropping the suggestion when the typed letters don't match.
2. **An Arabic-only overlap repair** in `server.ts`: drop letters at the start of the continuation that repeat the end of the typed fragment (marks ignored). This fixes the observed cases. Real Arabic words with doubled letters across the join (مما, ممن, يحيي) are the risk. It isn't suitable for English ("be" + "en").
3. **The completed-sentence contract:** the model restates the current sentence and the page strips the typed part. This is the most robust seam, at 10–20 more output tokens.
4. **Prompt changes** in `server.ts`, checked on a set of mid-word cases.

