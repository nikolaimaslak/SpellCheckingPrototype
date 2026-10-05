# Design

## Context

`postprocess(prefix, raw)` in `server/postprocess.ts` does the following:
1. strips quotes and whitespace from both ends of `raw`;
2. keeps the first line;
3. removes a repetition of the prefix's last 1–12 *whole* words;
4. cuts after the first sentence and at 20 words;
5. checks the script;
6. adds `' '` when the prefix doesn't end in whitespace and the result starts with a letter or digit.

Step 1 discards the only signal the model gives about word boundaries, and step 6 always assumes a new word.

`complete.ts` calls `postprocess` and then `safetyCheck`. It already builds the approved-library vocabulary (`libraryVocabulary`, using `vocabulary()` from `safety.ts`, normalized with `retrieval.ts`'s `normalize`).

The offline model (`server/models/fake.ts`) returns the canned text after the first occurrence of the prefix's last token. For "proce", that's "ssed within…", with no leading space. For "request", it's " has been…", with a leading space.

## Goals / Non-Goals

**Goals:**
- One pure decision function with the five spec steps, unit-tested without a model.
- Today's behavior is unchanged for whole-word prefixes and for callers without a vocabulary.

**Non-Goals:**
- Client changes.
- A dictionary on the server.

## Decisions

### D1. `joinOrSpace` in `postprocess.ts` (Tier 2)

`postprocess(prefix, raw, isWord?: (w: string) => boolean)`:
- Before trimming, record `rawLeadingSpace = /^\s/u.test(raw)`.
- After the existing whole-word repetition removal, if the prefix ends inside a word, compute `partial`: the prefix's trailing run of letters, digits and marks.
- Run the five steps on `partial` and the result's first word (its leading run of letters, digits and marks):
  1. If `first` starts with `partial`, case- and normalization-insensitively, and is longer, drop `partial.length` characters from the result → join.
  2. `rawLeadingSpace` → space.
  3. `isWord?.(partial + first)` → join.
  4. `!isWord || isWord(partial)` → space.
  5. Otherwise → join.
- **Step 1 runs before the sentence cut,** so a repeated "processed." stays aligned with the cut.
- **The script check** uses the joined word's script, which is the same as the partial's.

`isWord` is built in `complete.ts` from `libraryVocabulary(...)`, plus `vocabulary([req.prefix, ...transcript texts])`, compared through `normalize`. Normalized forms fold alef and hamza variants, so Arabic "استلا" + "م" → "استلام" matches the library's "استلام".

- *Why a predicate, not a Set parameter:* `postprocess` stays free of `safety.ts` and `retrieval.ts`, and tests can pass a tiny lambda.
- *Why step 2 before step 3:* when the model explicitly starts with a space, a new word is its stated intent. Step 3 is for the common case of no leading space, and step 4 keeps today's handling of models that omit the space before a new word.
- *Alternative rejected:* asking the model to return the whole current word every time and always stripping it (step 1 only). It's fragile across models, and the offline model doesn't do it.

### D2. Prompt line (Tier 2)

`systemInstruction` (both modes) gains: "If the agent's text ends in the middle of a word, begin with the rest of that word and no space; otherwise begin with a space." This makes step 2 reliable with Gemini. Steps 3–5 are the safety net.

### D3. The safety filter sees the final text

`safetyCheck` runs on the joined continuation, as now. The conversation-word check splits completion words with the segmenter, so a mid-word continuation "ssed" isn't a customer word. A test pins this.

### Undo, editable DOM, RTL

There's no client change. The client inserts the continuation exactly as returned, so a joined continuation extends the current word in one undo step. For RTL, the ghost overlay renders after the caret as before, and Arabic joined text simply continues the word.

## Risks / Trade-offs

- **Wrong join for a whole word that isn't in the vocabulary.** For example, the prefix "…the Absher" (a complete product name outside the library), and the model returns "app" without a space, gives "Absherapp". → Step 2 covers models that send the space, and the prompt asks for it. Step 5 only applies when the partial is unknown *and* the model sent no space. A test documents the trade-off. Adding the custom dictionary to the vocabulary is a later option.
- **Echo detection on short partials** (for example "a" + "about"). → Step 1 needs a partial of at least 2 characters. Otherwise steps 2–5 decide.
