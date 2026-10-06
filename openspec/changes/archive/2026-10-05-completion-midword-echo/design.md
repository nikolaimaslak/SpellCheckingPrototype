# Design

## Context

- `server/prompt.ts` `systemInstruction()` currently says: "If the agent's text ends in the middle of a word, begin with the rest of that word and no space; otherwise begin with a space."
- `server/postprocess.ts` already strips an echoed unfinished word (step 1 of the join-or-space rule).
- `src/completion/controller.ts` `requestNow()`:
  1. fetches;
  2. drops the reply if `generation` changed or the caret or text moved;
  3. shows the ghost text and emits `completion-shown`.

  The controller doesn't know about spelling.
- The page's `SpellService` (`src/spell/service.ts`) offers `isReady(lang)`, `check(words)` and the cached `misspelled(lang, word)`.
- `src/demo/main.ts` creates the spell service, then attaches completion.
- Measured on the real English engine: "ben" is rejected, while "n", "x" and "s" are accepted (lone letters are in the dictionary).

## Goals / Non-Goals

**Goals:**
- Suggestions that would create a misspelled first word, or a stray English letter, are never shown.
- The check is optional and never blocks completion.

**Non-Goals:**
- Repairing model output, or checking beyond the first word.

## Decisions

### D1. Prompt asks for the whole word (Tier 2)

The line becomes: "If the agent's text ends in the middle of a word, start by writing that whole word; otherwise begin with a space."

Echo stripping already handles this output: "been easily confused." becomes "en easily confused.". Fragments a model still sends go through the existing steps 2–5.

- *Why:* models produce whole words far more reliably than character fragments, as seen with Gemini's "n" for "be"→"been".

### D2. Pure first-word computation (Tier 1)

New `src/completion/word-check.ts`:
- **`firstWordToCheck(prefix, suggestion)`** → `{ word, standalone } | null`:
  - if the suggestion starts with a letter and the prefix ends in a letter, the word is the prefix's trailing word run plus the suggestion's leading word run (`standalone: false`);
  - else if the suggestion starts with whitespace and then a word, the word is that word (`standalone: true`);
  - otherwise (punctuation first, or empty) → `null`, and there's nothing to check.

  It uses the same letter/mark classes as the server's `PARTIAL` (`\p{L}\p{N}\p{M}`).
- **`strayLetter(word, lang, standalone)`:** true when `lang === 'en'`, `standalone`, the word is one letter, and it's not `a`/`A`/`I`.

The language comes from the tokenizer's `languageOf(word)`. A word with no language (mixed script, or digits) → no check.

### D3. Controller hook (Tier 1)

- `CompletionOptions.checkWord?: (word: string, lang: 'en' | 'ar') => Promise<boolean | undefined>`. `true` means correct, `false` misspelled, and `undefined` unknown (engine not ready).
- In `requestNow()`, after the existing "nothing moved" check:
  1. compute `firstWordToCheck`;
  2. if `strayLetter`, withhold;
  3. else if `checkWord` exists, `await` it, then re-check `generation`, caret and text (the same three conditions as after the fetch). `false` → withhold.
- **Withholding** emits `{ type: 'completion-withheld', lang, reason: 'spelling' }` and shows nothing.
- `CompletionEvent` gains the `completion-withheld` type and an optional `reason`.

### D4. Demo wiring (Tier 1)

`main.ts` passes:

```ts
checkWord: async (word, lang) => {
  if (!current?.isReady(lang)) return undefined;
  await current.check({ [lang]: [word] });
  const m = current.misspelled(lang, word);
  return m === undefined ? undefined : !m;
}
```

`current` is the spell service that `apply()` creates. It also covers spell-check mode `off`: the service still exists, so the check works even if the composer isn't attached for spelling. If the language is disabled in the policy, `isReady` is false, so `undefined` is returned and the suggestion is shown.

- *Why not inside `attachCompletion`:* the completion module stays independent of the spelling module, as today. The host decides what checks words.

### D5. Telemetry (Tier 2)

`server/telemetry.ts` adds `spelling` to `WITHHELD_REASONS`. `summarize` and `renderSummary` iterate the reasons, so the count shows up without a separate change. The client's batched events already go to `/v1/events` through `sanitize`.

### Undo, editable DOM, RTL

A withheld suggestion was never shown, so there's no undo or DOM impact. Arabic uses the same joined-word logic. Direction doesn't matter for logical string concatenation.

## Risks / Trade-offs

- **The dictionary rejects a valid word,** such as a GOSI term or a name, and a good suggestion gets withheld. → Custom dictionary words are accepted by the engine, so admins can add terms. The `spelling` count on `/summary` shows how often this happens.
- **An extra await before showing.** → `check` hits the cache after the first time and runs in the worker. The caret re-validation keeps a stale suggestion from appearing.
- **The single-letter rule is English-only.** → Arabic standalone single letters (و) are legitimate words, so no rule is applied there.
