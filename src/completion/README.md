# completion

**Inline completion client** (architecture §4): Gmail Smart Compose-style ghost text in any `contenteditable` composer. It runs in the browser and calls the Tier 2 completion service (`/api/v1/complete`) only after a typing pause. Nothing is written into the editable DOM until the agent accepts a suggestion.

```ts
import { attachCompletion, createCompletionClient } from './completion';

const handle = attachCompletion(el, {
  fetcher: createCompletionClient('/api'),
  sources: { transcript: true, canned: true, kb: true },
  transcript: () => turns, // the live conversation, oldest first
  checkWord: spellServiceCheck(() => spellService), // optional: vets the suggestion's first word
  onEvent: (e) => {},      // completion-shown / -accepted / -dismissed / -withheld; never any text
});
handle.dismiss(); // e.g. when Polish opens
handle.detach();
```

## Modules

- **`trigger.ts`:** `shouldRequest`. A request needs a pause, a collapsed caret at the end of its line, at least 3 words in the current sentence, no IME composition, and no spelling popover or polish panel open.
- **`client.ts`:** `createCompletionClient(baseUrl)`. A 2.5 s timeout, and `null` on any failure, so a slow or missing service just shows nothing.
- **`ghost.ts`:** the overlay that draws the suggestion after the caret, in the composer's font and a muted color, following the line direction. In a composer with a fixed left-to-right base direction, Arabic ghost text goes on the line below.
- **`word-check.ts`:** `firstWordToCheck` (the word a suggestion would produce first: the unfinished word joined with the fragment, or the first new word), `strayLetter`, and `spellServiceCheck` (a `checkWord` backed by the page's spell service).
- **`keys.ts`:** `ghostKeyAction` (what a key does while ghost text shows), `nextWord`, `detectMac`.
- **`controller.ts`:** `attachCompletion`, which ties these together.

## Keys while ghost text is showing

| Key | Effect |
|---|---|
| Tab | Accept the rest of the suggestion |
| **Forward arrow**: Right for an English suggestion, Left for an Arabic one | Accept the rest, like Tab |
| Ctrl + forward arrow (Option + forward arrow on macOS) | Accept the next word: leading whitespace, then up to the next whitespace. The rest stays. |
| Typing the suggestion's next characters | Consumes them; the rest stays |
| Escape | Dismiss; the host never sees the key |
| Backward arrow, Shift + arrow, Up, Down, Home, End, Page Up, Page Down, Enter | Dismiss; the key still does its normal job (Enter still sends) |

The forward arrow follows the **suggestion's** direction (an Arabic prefix means right to left), not the composer's: in Agent Desktop's fixed left-to-right composer, Arabic ghost text still reads right to left. Alt is never used outside macOS, because Alt+Left is the browser's Back. These keys are intercepted only while ghost text is showing and focus is in the composer.

Every accept goes through `env.replace` (`execCommand('insertText')`): **one undo step per accept** and an ordinary host `input` event. A word accept fires an input event that the type-through logic consumes, so word accept and typing through share one path. When the suggestion is used up, the next pause may request a new one. No request is made while words remain.

## First-word check

Before a suggestion is shown, the first word it would produce is checked:
- **Joined fragment:** "be" + "n easily" gives "ben". If the engine rejects it, nothing is shown.
- **Lone English letter:** " n easily" starting a new word is never shown. "a" and "I" are exempt. The dictionary itself accepts lone letters, hence this extra rule.

When `checkWord` is absent, or returns `undefined` because no engine is ready for the language, the suggestion is shown unchecked. A withheld suggestion emits `completion-withheld` with reason `spelling`.

The server asks the model to start by repeating the whole unfinished word, and strips the repeat (`server/postprocess.ts`). Models get whole words right far more often than fragments, so this check is only the safety net.

## Events

- `completion-shown`: carries the latency and the shown length.
- `completion-accepted`: carries the accepted length, which counts every character accepted or typed through. A suggestion that was partly accepted word by word and then abandoned still ends as accepted.
- `completion-dismissed`: emitted otherwise.
- `completion-withheld` with `reason: 'spelling'`: the first-word check stopped the suggestion. The server records its own withheld reasons (figures, dates, identifiers, conversation words) itself.

Events never contain the suggestion or the composer text. The server keeps only allowlisted fields.

## Testing seams

`env: { replace, measure, isMac }` replaces the browser edit path, the layout measurement (jsdom has no layout) and the platform check. See `test/completion/controller.test.ts`.
