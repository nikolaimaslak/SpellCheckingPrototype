# Design

## Context

`POST /v1/complete` (`server/complete.ts`) works in four steps:
1. it parses the request and retrieves up to 3 canned responses and up to 2 KB passages;
2. it builds the prompt (`server/prompt.ts`);
3. it calls the model;
4. it runs `postprocess(prefix, raw)` (`server/postprocess.ts`): strip the repeated prefix, keep one sentence of up to 20 words in the same script, and add a leading space.

The reply is `{ completion, lang, latencyMs, model, sources }`. `server/main.ts` serves the routes and `/health`, and appends client telemetry to a JSONL log through `server/telemetry.ts` (`sanitize` keeps only allowlisted fields; `summarize` and `renderSummary` build `/summary`).

The server runs as TypeScript under Node and doesn't import `src/`. The client already shows nothing for an empty completion.

## Goals / Non-Goals

**Goals:**
- One pure, deterministic filter function, unit-tested in Node, that both languages share.
- Every withheld completion is countable, without any text leaving the request.

**Non-Goals:**
- Changing retrieval, the model, or the client.

## Decisions

### D1. A pure filter in `server/safety.ts` (Tier 2)

```ts
safetyCheck(completion, {
  prefix, customerTurns, sent, library, allowSourcedFigures,
}): 'figure' | 'date' | 'identifier' | 'conversation' | null
```

- `sent`: the texts of the canned responses and KB passages sent with this request.
- `library`: all canned and KB texts.

Checks run in the order identifier → conversation → figure → date. The first reason found is returned. With `allowSourcedFigures`, a `figure` or `date` result is cleared when `verbatimIn(completion, sent)`.

**Tokens.** `Intl.Segmenter` word segmentation. Arabic words are normalized with the same `stripMarks` + alef folding the retrieval code already uses (`server/retrieval.ts`). Before the number-word, month and weekday checks, one leading proclitic (و ف ب ل ك) and/or ال is stripped.

**The checks:**
- **Digits:** `\p{Nd}`.
- **Number words, months, weekdays, relative days, time units, relative words, currency:** small inline sets per language, as listed in the spec. English number words and months are matched case-insensitively, except:
  - "May" counts only next to a digit;
  - "March" counts only when capitalized;
  - "one" is excluded ("someone", "no one", "one of our agents").
- **Timeline:** a time-unit token and a relative-word token anywhere in the same continuation, which is at most one sentence.
- **Identifiers:** the email and URL patterns, copied from `src/tokenizer/exclusions.ts`. The server can't import them, and a comment points to the original.
- **Conversation words:** customer-turn tokens of 3 or more letters, minus the words of the prefix and the library vocabulary. A hit is any completion token in that set.

**`verbatimIn`:** the completion without its leading space and trailing `.` `!` `?` `؟`, normalized (lower case, marks stripped, whitespace collapsed), as a substring of some normalized `sent` text.

- *Why the library vocabulary, not only the passages sent:* it cuts false drops when the customer and the approved texts share ordinary words ("request", "pension", "طلب"). Words that appear in no approved text are where names live.
- *Why not reuse `src/` via a build step:* the server's "no `src/` imports" rule keeps it runnable with plain Node. The duplicated regexes are two lines, with a pointer to the original.

### D2. Wiring in `complete.ts` (Tier 2)

After `postprocess`, call `safetyCheck` with:
- the request's customer turns;
- the texts of the canned and KB passages actually sent;
- the vocabulary of the whole approved library, derived from the existing `deps.library` (canned) and `deps.kb` (passages), computed once per data set and cached in a `WeakMap`;
- `allowSourcedFigures`.

On a hit, return `completion: ''` with `withheld: reason`, and call `deps.onWithheld?.(reason, lang)`. `main.ts` wires that callback to append a `completion-withheld` event to the log.

`CompleteDeps` gains `allowSourcedFigures?: boolean` (default `false`, so `block`) and `onWithheld?`. Existing callers and tests keep compiling, with the filter always on.

### D3. Prompt (Tier 2)

`SYSTEM_INSTRUCTION` becomes a function of `allowSourcedFigures`:
- `block`: "Do not include any number, amount, date, day, time period, reference number, email address, link, or person's name."
- `allow`: "Include figures, dates or time periods only exactly as written in the approved responses or knowledge base. Never include reference numbers, email addresses, links or names."

The stable-first prompt order is unchanged. The instruction is constant per server run, so the prompt-prefix sharing still holds.

### D4. Setting and telemetry (Tier 2, config)

- `COMPLETION_SOURCED_FIGURES` is read once in `main.ts`: `allow` turns it on; any other value, or no value, means `block`. `/health` adds `sourcedFigures: 'block' | 'allow'`.
- In `telemetry.ts`:
  - `completion-withheld` joins the completion event types;
  - `reason` is allowlisted for it, but only if it is one of the four values;
  - `summarize` counts withheld events by reason;
  - `renderSummary` shows them next to "shown".

  The event is written by the server itself. The client never sends it, so the client's batching code is unchanged.

### Undo, editable DOM, RTL

None of this touches the browser. An empty completion is the existing "show nothing" path.

## Risks / Trade-offs

- **Over-blocking.** Any number word or time unit next to "within" drops a useful suggestion, and the conversation rule may drop echoes of the customer's ordinary wording. → It's the strict reading of Req 3.7 until SV answers question 3. The `/summary` withheld counts show how much is lost, and the prompt steers the model away from those patterns, so fewer drops happen in the first place.
- **Under-blocking.** Spelled-out dates in unusual forms, names that also appear in the approved texts, or identifiers without digits ("ABC-XYZ") pass. → Deterministic and documented. The prompt forbids them too. A real-traffic sample (SV request 2) would measure it.
- **The demo loses its flagship suggestion under the default.** → `COMPLETION_SOURCED_FIGURES=allow` restores it, and `docs/TESTING.md` explains both modes.
- **Arabic proclitic stripping can over-match**, for example "بست" read as ب + ست. → Only tokens whose remainder is exactly a listed word are matched, and the lists are short. This is a precision cost on completions only, never on the agent's text.
