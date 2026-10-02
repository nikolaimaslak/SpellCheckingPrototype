# Design

## Context

Builds on Phase 1 (see proposal.md, Why):
- `attachSpellCheck` (debounced recheck, live-Range underlines through one shared Highlight, popover, `env.replace` → `execCommand('insertText')`).
- `createSpellService` (staged loading, shared cache).
- The worker's `check`, `suggest` and `add` requests.
- The tokenizer (`buildTextMap`, `tokenize`, `rangeFor`, `caretOffset`).

**Probe of the agreed rule** (real engine and dictionaries, October 2, 2026). Rule: one single-edit suggestion, minimum length, same first letter.
- **English:** 30 common typos. 17 auto-fixed (seperate, definately, untill, beleive, accomodate, goverment, freind, becuase, enviroment, necesary, sucess, thnak, reqeust, informaton, paymnet, registraiton, pensoin), **0 wrong**. Ambiguous ones stayed suggestions: recieve (receive/relieve), acount, wierd, thier, contributon. Two misses came only from engine "word-break" suggestions: "occur-ed" and "ca-lender".
- **Arabic:** 20 typical slips.
  - With "≥ 4 letters, exact first letter": 3 auto-fixed (مساعده, الاجتماعيه, النضام).
  - With "≥ 3 letters, alef forms ا أ إ آ equal for the first-letter test": 5 (adds اذا→إذا, الى→إلى), **0 wrong**.
  - AyaSpell returns many one-edit variants that just add a one-letter proclitic (ل, ت, ف…), so most Arabic slips stay ambiguous. That's conservative, which is the intent.

## Goals / Non-Goals

**Goals:**
- High precision over recall: a wrong automatic change costs more trust than a missed one (architecture §6, Arabic QA risk).
- Automatic changes use exactly the same edit path as manual ones, so undo and host models behave identically.
- The confidence rule is a pure, table-tested function, so thresholds can be tuned against a growing typo corpus.

**Non-Goals:**
- Learning from reverts across sessions (needs telemetry storage, Phase 3).
- Auto-correcting a word that was edited in the middle (only the word just completed at a typed boundary).

## Decisions

### 1. Confidence rule as a pure function (Tier 1, `src/autocorrect/confidence.ts`)
`decide(word, lang, suggestions, ctx) → replacement | null`, where `ctx = { ignored, customWords }`.
1. Reject if the word is ignored, a custom word, or all-caps (has cased letters and equals its upper case).
2. **Normalize:** lower-case, and for `ar` apply `stripMarks`.
3. **Candidates:** suggestions without a space, and without a hyphen unless the word has one, in the same script (`languageOf` from the tokenizer).
4. **Single-edit set:** candidates whose optimal-string-alignment distance (Damerau with adjacent transposition, by code point) to the word is exactly 1. It must contain **exactly one** element.
5. **Length:** ≥ 4 code points for `en`, ≥ 3 for `ar` (after stripping marks).
6. **First letter:** equal case-insensitively. For `ar`, the alef forms ا أ إ آ map to one class for this comparison only.
7. **Case:** if the word is capitalized (first letter upper, rest lower), capitalize the replacement.

**Deviation from the agreed wording (flagged for review):** "≥ 4 letters" and "same first letter" were agreed for both languages. For Arabic, the probe shows that this blocks the most common short hamza slips (اذا, الى, which are 3 letters starting with bare alef) while the relaxed form produced no wrong fixes. Missing initial hamza is the textbook Arabic typo. This doesn't contradict Phase 1's "no alef folding for correctness": the word is still *flagged* as misspelled. The alef class only lets an unambiguous fix through.

`osa(a, b)` lives in `src/autocorrect/distance.ts` (small DP, tested).

### 2. Trigger: a typed boundary only (Tier 1, `src/autocorrect/trigger.ts`)
`completedWord(event, map, caret, tokens)` returns the token to consider, or `undefined`. It fires only when:
- `event.inputType` is `insertText` with `data` being one code point matching `[\s\p{P}]` (covers Arabic ، ؛ ؟), or `insertLineBreak` or `insertParagraph`;
- `!event.isComposing`;
- the last token before the caret ends at or before the caret, with only boundary characters (whitespace, punctuation, `\n`, U+FFFC) and at most 3 of them between its end and the caret.

These are excluded by construction:
- **Paste:** `insertFromPaste`.
- **Host insertions:** `insertText` with multi-character `data`, as for predefined messages. Emoji are one code point but not `\p{P}` or whitespace.
- **Undo and redo:** `historyUndo` and `historyRedo`.
- **Caret moves:** no input event at all.
- **Enter-to-send in chat:** the demo host cancels the keydown, so no input event happens and no special-casing is needed. For Agent Desktop this is verified in task 7.2, with a `sendOnEnter` fallback ready (see Risks).

### 3. Pipeline and apply (Tier 1, `src/composer/attach.ts`)
On `input` (in addition to the existing debounced recheck):
1. Synchronously tokenize and find `completedWord`.
2. `await service.check({ [lang]: [word] })`. If misspelled, `await service.suggest(lang, word)`, then `decide(...)`.
3. Re-validate: the token's live Range text must still equal the word, and the composer must still be connected and non-empty. If either fails, give up.
4. **Caret bookkeeping:** take the current caret flat offset `c` from a fresh map. Call `env.replace(range, replacement)`. Then put the caret at `c + (replacement.length - word.length)` through a new `pointAt(map, offset)` helper in `src/tokenizer/textmap.ts`. If the caret was before the word (rare), it stays where it was.
5. Record the correction `{ range, original, replacement, lang, flatStart }`, where `range` is a fresh live Range over the replacement. Flash it, emit an `autocorrect` event, and schedule a recheck.

The whole pipeline is async and usually done within a few ms (local worker). If the agent keeps typing meanwhile, the live Range and the caret bookkeeping keep their text and position correct.

### 4. Flash highlight (Tier 1, `src/composer/highlights.ts`)
Generalize `acquireHighlights(env, name, css)` so it can own more than one named highlight. Add `bp-autocorrected` with `background-color: rgba(43,108,176,.18)`. Each correction's range is added for 2 s and then removed. As with underlines, nothing is written into the editable DOM. On Arabic text under the host's LTR base, highlights paint the word's glyph runs correctly (verified for underlines in Phase 1).

### 5. Revert (Tier 1, `src/composer/attach.ts`, `popover.ts`)
- **From the popover:** a click or the shortcut inside a correction whose Range text still equals `replacement` opens the popover in **revert form**, with "Revert to *original*" (RTL for Arabic). Choosing it calls `env.replace(range, original)`, which is one undo step. Then add `lang:original` to the ignore set, emit `revert`, and drop the correction.
- **Via Undo:** on `input` with `inputType === 'historyUndo'`, check each recorded correction. Re-tokenize, and if a token at `flatStart` now equals `original`, treat it as reverted: ignore set, `revert` event, drop. The live Range may have collapsed during undo, so the flat start is the anchor.
- A correction whose text no longer equals `replacement` (edited since) is dropped, so no Revert is offered.

### 6. Assistance policy (config, `src/policy/`)
```ts
type AssistMode = 'off' | 'suggest' | 'auto';
interface AdminPolicy { mode: AssistMode; languages: Lang[]; agentMayLower: boolean; customDictionary: string[] }
interface AgentPreference { mode?: AssistMode }
resolveMode(policy, pref): AssistMode   // agent's choice only if allowed and rank(pref) <= rank(admin)
DEFAULT_POLICY = { mode: 'suggest', languages: ['en','ar'], agentMayLower: true, customDictionary: [] }
```
The default stays `suggest`, because auto must be an explicit admin choice. `parsePolicy(unknown)` validates stored or untrusted input and falls back field by field to the defaults.

### 7. Custom dictionary injection (Tier 1, `src/spell/service.ts`)
`createSpellService(requester, { languages, customWords })` replaces the positional `languages` argument; callers are updated.
- **Injection:** after a language loads, send one `add` per custom word whose `languageOf` is that language, before publishing the language as ready. Words with whitespace are skipped.
- **Cache:** the per-language cache is untouched, because it's still empty when the language becomes ready.
- **Auto-correct guard:** `decide` also rejects words in `customWords`, which matters when a custom word arrives through the cache path.

### 8. Attach API change (Tier 1, `src/composer/attach.ts`)
`AttachOptions`:
- `enabled` is replaced by `mode: 'suggest' | 'auto'`. Callers resolve `off` by not attaching, per the modified "Attach and detach" requirement.
- Adds `customWords?: string[]` (for `decide`) and `onEvent?: (e: AssistEvent) => void`, where `AssistEvent = { type: 'autocorrect' | 'revert' | 'accept' | 'ignore'; lang; original; replacement? }`.

Existing accept and ignore paths emit `accept` and `ignore`.

### 9. Demo and loader (demo harness, dev only)
- **Demo panel** (`src/demo/settings.ts`):
  - **Controls:** admin mode select, language checkboxes, agent-may-lower checkbox, custom-dictionary textarea, and an agent preference select (disabled unless allowed).
  - **Apply:** recreates the spell service (terminating the old worker through a new `SpellClient.terminate()`) and re-attaches both composers with `resolveMode`.
  - **Persistence:** `localStorage` behind try/catch, per the "persists for that browser" scenario.
  - **Event counter:** counts `onEvent` events by type.
- **Loader:** reads `window.__bpSpellConfig = { mode, customDictionary }` if set before the import (default `suggest`).

### Tier map
| Component | Tier |
|---|---|
| `src/autocorrect/*` | Tier 1 (page thread, pure plus trigger) |
| `src/composer/*` changes | Tier 1 (host integration) |
| `src/spell/service.ts` custom words | Tier 1 (page thread → worker `add`) |
| `src/policy/*` | config |
| `src/demo/settings.ts` | demo harness |
| `dev/ad-loader` config | dev only |

### Testing approach
- **`decide` and `osa`:** table tests, plus a **corpus test** that runs the probe's 30 English and 20 Arabic typos through the real engine (Node). It asserts the exact auto-fixed set and that every auto-fix equals the intended word, so tuning can't silently add a wrong fix.
- **Trigger:** jsdom tests with synthetic `InputEvent`s: typed space, Arabic ؟, `insertParagraph`, paste, multi-character insert, emoji, `historyUndo`, composing.
- **Apply, caret and revert logic:** jsdom with a fake `env.replace` that really mutates the text node, so live Ranges and `pointAt` are exercised.
- **Policy:** `resolveMode` truth table and `parsePolicy` fallbacks.
- **Real Chrome (scripted):** native undo granularity, flash, caret after fast typing, Enter-to-send leaving the typo as typed, and revert from the popover. Then one run on the real Agent Desktop through the loader.

## Risks / Trade-offs

- [Chrome may merge the auto-correct `insertText` into the agent's typing undo group, so one Undo removes more than the correction] → Verified first in the Chrome checks (task 4.x). If it merges, insert an undo-group break before the replacement, either by moving the selection before `execCommand` (which Chrome treats as a new group) or by an explicit `selectionchange`. Re-test. The popover "Revert" path is unaffected either way.
- [The async decision lands after the agent typed more] → Live Range re-validation plus caret bookkeeping. Tested with a fast-typing scenario.
- [The relaxed Arabic thresholds could let through a wrong fix that the 20-word corpus didn't cover] → It's corpus-tested, and the threshold is one constant. The Arabic native-speaker QA pass (architecture §6) remains a prerequisite before enabling `auto` for GOSI; it's recorded as an open item, not done here.
- [Recall is low for Arabic (25% in the probe)] → Accepted for Phase 2: precision first. A proclitic-aware candidate filter or frequency data can raise recall later without changing the rule's shape.
- [A host that doesn't cancel Enter, so an `insertParagraph` or `insertLineBreak` input event fires before it sends] → Phase 1 only showed that Agent Desktop sends on Enter and clears the composer, not whether an input event fires first. This is checked on the real Agent Desktop (task 7.2). If one does fire, the trigger additionally ignores line-break boundaries in composers flagged as send-on-Enter (a `sendOnEnter` attach option), so the word being sent is never changed.
- [Custom words are applied only at load] → Matches the architecture's "propagates on next login". The demo re-creates the service on Apply.

- [Hunspell's `suggest()` is time-limited (100 ms per stage, 250 ms in total), so under CPU load it returns fewer candidates and the confidence rule can treat an ambiguous word as clear: auto-correct gets more aggressive on slow machines] → Found during implementation and deliberately deferred: see `docs/known-issues.md` (KI-1) for evidence and the recommended deterministic one-edit check. Until then, `auto` stays opt-in, every change is revertible, and the corpus test guarantees no wrong fix over a floor of expected fixes.

## Migration Plan

Callers of `attachSpellCheck({ enabled })` and `createSpellService(req, languages)` are updated in this change: the demo, the loader and the tests. No deployed users exist.

## Open Questions

- The native-speaker Arabic QA pass on auto-correct output, needed before GOSI enables `auto`. It doesn't affect this change's code; it gates rollout.

## Implementation Notes

- **Corpus result** (`test/autocorrect/corpus.test.ts`, real engine):
  - **English:** 19 of 30 auto-fixed. These are the 17 from the probe plus occured→occurred and calender→calendar, now that hyphenated and split suggestions are filtered.
  - **Arabic:** 5 of 20 (اذا, الى, مساعده, الاجتماعيه, النضام).
  - **Accuracy:** every auto-fix equals the intended word.
- **Undo granularity in Chrome** (demo page): there was no merging, so no group-break mitigation was needed.
  - Right after a correction, one Undo restores only the original word.
  - With more typing after the correction, Undo first removes that typing, then reverts only the correction, then removes the earlier typing as one group (Chrome's normal coalescing).
  - After Undo, Chrome leaves the restored word selected, so the next keystroke replaces it. This is standard browser behavior and left as is.
- **Fast typing:** the completed word must be captured synchronously at the input event. Computing it when the queued async step ran picked the wrong word once the caret had moved on (caught by the composer tests and fixed).
- **Real Agent Desktop run** (dev tenant, October 2, 2026, loader with `{ mode: 'auto', customDictionary: ['GOSI'] }`):
  - "please seperate " was auto-corrected to "please separate " with the flash, and the composer HTML had no extra markup. One Undo restored "seperate".
  - "رقم النضام GOSI " became "رقم النظام GOSI ". GOSI wasn't flagged. The popover offered an RTL "Revert to النضام", which restored the word.
  - Events arrived as `autocorrect`, `revert`, `autocorrect`, `revert`.
- **Enter-to-send on Agent Desktop** (task 7.2): a trusted Enter keydown reached the composer, but no `beforeinput` or `input` event fired before Agent Desktop sent the message and cleared the composer. The message went out exactly as typed ("please seperate"). **The `sendOnEnter` fallback is not needed** for Agent Desktop.
