# Design

## Context

`src/completion/controller.ts` attaches to a composer, requests a completion after a pause, and shows it with `createGhost` (`ghost.ts`), passing a direction: `'rtl'` when the last word of the prefix is Arabic. A window-level capture `keydown` handler does the following while ghost text is showing and focus is in the composer:
- Tab: `preventDefault` + `stopImmediatePropagation`, then `accept()`, which inserts through `env.replace` (`execCommand('insertText')`: one undo step, host `input` event);
- Escape: dismiss without reaching the host;
- `NAV_KEYS` (Enter and all arrows, Home/End, Page Up/Down): dismiss without preventing, so Enter still sends.

Typing-through is detected in `onInput`: an `insertText` whose data matches the start of the ghost text at its anchor consumes it and re-shows the rest. When nothing is left, it emits `completion-accepted`.

## Goals / Non-Goals

**Goals:**
- One pure function decides what a key does, so it can be tested without a DOM.
- A word accept reuses the type-through path, not a second way of consuming ghost text.

**Non-Goals:**
- Changing the request rule, the ghost layout or the server.

## Decisions

### D1. A pure key classifier (Tier 1, page)

New `src/completion/keys.ts` exports:
- `ghostKeyAction(e, dir, isMac)` → `'accept-all' | 'accept-word' | 'dismiss' | 'escape' | 'none'`:
  - Tab without modifiers → `accept-all`;
  - the forward arrow (Right for `ltr`, Left for `rtl`) without modifiers → `accept-all`;
  - the forward arrow with only Ctrl (or only Alt when `isMac`) → `accept-word`;
  - Escape → `escape`;
  - Enter, Up, Down, Home, End, Page Up, Page Down, the backward arrow, any arrow with Shift, or a forward arrow with other modifiers → `dismiss`;
  - anything else → `none`.
- `nextWord(text)`: the longest prefix matching `/^\s*\S+/u`, or the whole text when it is only whitespace.

`isMac` comes from `navigator.userAgentData?.platform ?? navigator.platform` matching `/mac/i`, read once at attach. It can be overridden through `CompletionOptions.env` for tests.

- *Why Alt on macOS and not Ctrl:* macOS reserves Ctrl+arrow for Mission Control and Spaces. Option+arrow is the native word-jump there.
- *Why not Alt on Windows:* Alt+Left is the browser's Back button. Intercepting it could make an agent lose the page.

### D2. Direction comes from the suggestion, not the composer

The forward arrow is chosen by the direction already passed to `ghost.show()` (Arabic prefix → `'rtl'`). That's the suggestion's reading direction. In the fixed-LTR composer, Arabic ghost text sits on the line below in right-to-left order, so its "next" word is to the left, and Left Arrow is still the natural forward key.

- *Alternative rejected:* the composer's computed `direction`. It is `ltr` in Agent Desktop for Arabic too, so it would map Arabic suggestions to Right Arrow, against their reading order.

### D3. Word accept goes through the type-through path

On `accept-word`, the controller calls `env.replace(caretRange, nextWord(ghost.text))`. The resulting `input` event (`insertText` with that data, caret at `anchor + length`) is exactly what typing-through recognizes, so the existing `onInput` branch re-shows the rest, or emits `completion-accepted` when nothing is left. One mechanism serves both, and each word is one undo step, because each `execCommand` is one.

Bookkeeping: `shown` gains `consumed` (characters typed through or accepted so far) and `wordAccepted` (a word-accept key was used).
- `dismiss()`: if `wordAccepted`, emit `completion-accepted` with `acceptedLength: consumed`; otherwise `completion-dismissed`, as today.
- `accept()` (Tab or forward arrow): `acceptedLength = consumed + remaining length`. Today it reports only the remaining length, which undercounts after typing-through. This change fixes that as a side effect.

The keydown handler keeps its capture-phase registration and its "only while ghost text is showing and focus is in the composer" guard. `accept-all` and `accept-word` call `preventDefault` + `stopImmediatePropagation`, so neither the host nor the browser moves the caret. `dismiss` keeps today's non-preventing behavior.

### D4. Regeneration needs no new code

After the last word or a Tab accept, the inserted text fires `input`, which already runs `schedule()`. The next completion follows the normal pause rule. While words remain, `onInput` returns before `schedule()`, so no request is made (proposal, Non-goals).

### Undo, editable DOM, RTL

- **Undo:** one step per accept, the same as Tab today.
- **Editable DOM:** ghost text stays in the overlay, and nothing new is written into the editable DOM.
- **RTL:** covered by D2. The ghost's own layout logic is unchanged.

## Risks / Trade-offs

- **A one-character word accept looks like a typed boundary to auto-correct.** If the remaining ghost text is a single punctuation character such as ".", accepting it inserts one character, and the spelling layer treats it like a typed boundary for the word before. → Harmless in practice: auto-correct only changes misspelled words, and the word before is either the agent's own (where the same would happen if they typed ".") or completion text, which is spelled correctly. A test pins that a correctly spelled word before an accepted "." stays unchanged.
- **Hosts that bind arrow keys themselves.** Agent Desktop's composer might use Right Arrow while a suggestion shows. → The keys are only intercepted while ghost text is showing, which is the requirement's intent. To verify on a live tenant with `dev/ad-loader`, as a manual check.
- **macOS detection is heuristic.** → It's overridable in tests. A wrong guess only swaps which modifier accepts a word, and the other modifier then dismisses harmlessly.
