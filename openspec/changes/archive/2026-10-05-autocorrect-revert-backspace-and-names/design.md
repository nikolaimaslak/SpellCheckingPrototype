# Design

## Context

- `decide(word, lang, { neighbors, caseFix }, ctx)` in `src/autocorrect/confidence.ts` is pure. Its guards are the ignore list, the custom dictionary and all caps.
- `src/composer/attach.ts` calls it from `autoCorrect(token)`, after the typed boundary that completed `token`. There, the text map, the token's flat start and the caret are all at hand.
- Reverts run through `revert(c)` (popover) and `detectUndoRevert()` (Undo): both add the original to the session `ignored` set and emit `revert`.
- `eval/pipeline.ts` mirrors `autoCorrect` on plain messages, with no conversation.
- The demo already reads its chat transcript (`readTranscript`) for completion.

## Goals / Non-Goals

**Goals:**
- Both new guards are pure functions of the text and the conversation, shared by the composer and the eval.
- Backspace-revert reuses the existing revert path, so the event, the ignore list and the flash are handled as for the popover.

**Non-Goals:**
- Name detection beyond capitals and conversation words.
- Changing which words get underlined.

## Decisions

### D1. Pure context helpers (Tier 1, page)

New `src/autocorrect/context.ts`:
- **`startsSentence(text, start)`:** true if `start` is 0. Otherwise it looks back from `start` past whitespace and opening quotes or brackets:
  - true if it reaches the beginning of the text or a line break;
  - true if it reaches `.` `!` `?` `؟`, the whitespace was non-empty, and the token before a `.` isn't an honorific or abbreviation;
  - false otherwise.

  Honorifics and abbreviations: `Mr Mrs Ms Dr Prof Eng St Jr Sr vs etc`, plus the dotted forms `e.g.` and `i.e.`, compared case-insensitively. That's a short fixed list, enough for agent text.
- **`conversationWords(turns)`:** the set of normalized word forms in the customer's turns. English is lowercased, Arabic is `stripMarks`'d. Tokens come from the same `Intl.Segmenter` word segmentation the tokenizer uses, plus the tokenizer's `languageOf`.
- **`inConversation(word, lang, words)`:** looks the normalized word up in that set.

`DecideContext` gains `startsSentence: boolean` (default `true`, so existing callers keep their behavior) and `conversation?: ReadonlySet<string>`. `decide()` adds two guards right after the all-caps guard, before the list:
1. `startsUpper(word) && !ctx.startsSentence` → null;
2. `ctx.conversation` contains the normalized word → null.

Both apply to every rule (list, case, neighbor), per the spec. Arabic has no case, so guard 1 never fires for it.

- *Why a default of `true`:* callers that know nothing about position (unit tests, any future caller) keep today's behavior. The composer and the pipeline always pass the real value.
- *Alternative rejected:* checking sentence position inside `decide()` from a passed-in text. It would make the pure decision depend on the surrounding message, and lose its simple word-level tests.

### D2. Composer wiring (Tier 1, page)

- `AttachOptions.conversation?: () => { role: string; text: string }[]`. That's the shape `readTranscript` returns and completion already takes.
- In `autoCorrect(token)`, read it once per decision, keep the `customer` turns, and build the word set. Transcripts are short (tens of turns), so rebuilding is cheaper than tracking changes. Compute `startsSentence(before.text, start)` from the map already built there.
- The demo passes `conversation: () => readTranscript(transcript)` to both composers.

### D3. Backspace revert (Tier 1, page)

After `autoCorrect` applies a correction and restores the caret, it records `justCorrected = { correction, text: map.text, caret }`. It's cleared by:
- any `input` event (the agent typed, deleted, pasted, undid…). It's set *after* `env.replace` returns, so the correction's own input event doesn't clear it;
- any `keydown` other than a lone Backspace or a modifier key on its own;
- a `mousedown` in the composer;
- `detach`.

On `keydown` Backspace without modifiers, the revert happens only if all of these hold:
- `justCorrected` is set;
- the correction still stands;
- the selection is collapsed at the recorded caret;
- the text equals the recorded text;
- the text between the correction's end and the caret is 1–3 boundary characters (the trigger's `GAP`).

Then the handler:
1. calls `preventDefault()` and `stopImmediatePropagation()`;
2. calls the existing `revert(c)` (`env.replace(c.range, original)`: one undo step, the `revert` event, the session ignore list);
3. puts the caret back after the boundary, shifted by the length difference, as `autoCorrect` does.

- *Why keydown and not beforeinput `deleteContentBackward`:* it can be cancelled reliably in every browser and in the host's GWT editor, and it matches how the shortcut is handled today.
- *Why record the text:* a host write without an input event (rare) would otherwise leave a stale `justCorrected`.

### D4. Eval (eval)

`eval/pipeline.ts` computes `startsSentence(typedSoFar, token.start)` for each completed word and passes it to `decide`. Dataset messages carry no conversation, so the conversation guard isn't exercised there. It's covered by unit and composer tests. The parity test passes no conversation on the composer side either.

### Undo, editable DOM, RTL

- **Undo:** a Backspace revert is one undo step, the same as the popover's Revert. Undoing it brings the correction back, as the spec says.
- **Editable DOM:** nothing is written into it.
- **RTL:** a Backspace revert is direction-neutral. The boundary is identified logically, by flat offsets, not visually. Arabic has no capitals, so the sentence-start guard only affects Latin script, including Latin words in mixed messages.

## Risks / Trade-offs

- **Fewer English fixes for capitalized typos in mid-sentence** (for example "the Seperate form"). → This is accepted precision over recall, and it's measured: the eval's by-source table and the coverage figures show the cost.
- **A customer's own misspelling protects the same misspelling in the agent's reply** ("recieve" in the customer's message). → It's only left unreplaced, still underlined with suggestions. Precision first.
- **The honorific list is English-only and short.** → Agent text only. It's easy to extend, and a miss only means a name at a non-sentence start gets the normal rules, which is today's behavior.
- **The Backspace interception could surprise an agent who wanted to delete the space.** → The flash shows the correction, the window is a single key press, and a second Backspace deletes as usual. This matches Req 4.2.1.

## Migration Plan

- Run `npm run eval:check` against the current baseline. Expect corruptions to drop (Fatimah, Harbi), coverage to dip slightly, and no new identities.
- Then run `npm run eval:baseline`. Rollback is a revert.
