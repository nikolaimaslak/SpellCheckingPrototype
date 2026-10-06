# completion

**Inline completion client** (architecture §4): Gmail Smart Compose-style ghost text in any `contenteditable` composer. It runs in the browser and calls the Tier 2 completion service (`/api/v1/complete`) only after a typing pause. Nothing is written into the editable DOM until the agent accepts a suggestion.

```ts
import { attachCompletion, createCompletionClient } from './completion';

const handle = attachCompletion(el, {
  fetcher: createCompletionClient('/api'),
  sources: { transcript: true, canned: true, kb: true },
  transcript: () => turns, // the live conversation, oldest first
  onEvent: (e) => {},      // completion-shown / -accepted / -dismissed; never any text
});
handle.dismiss(); // e.g. when Polish opens
handle.detach();
```

## Modules

- **`trigger.ts`:** `shouldRequest`. A request needs a pause, a collapsed caret at the end of its line, at least 3 words in the current sentence, no IME composition, and no spelling popover or polish panel open.
- **`client.ts`:** `createCompletionClient(baseUrl)`. A 2.5 s timeout, and `null` on any failure, so a slow or missing service just shows nothing. The reply's `completion` is what the ghost text shows; `edit` describes it (below).
- **`ghost.ts`:** the overlay that draws the suggestion after the caret, in the composer's font and a muted color, following the line direction. In a composer with a fixed left-to-right base direction, Arabic ghost text goes on the line below.
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

## Unfinished words: the continuation and its edit

The server sends the model the agent's text exactly as typed and asks for one JSON field, `continuation`: the text that goes right after the caret (the typed DSPy program `ContinueText` in `server/assist/programs.py`). Its instructions give one rule per way the text can end, each with an English and an Arabic example:
- **mid-word:** the missing letters, no space ("proce" → "ssed today.");
- **a complete word:** a space or punctuation first ("Your request" → " has been received.");
- **a space:** the next word, no space;
- **punctuation:** a space, then the next word.

The JSON is read leniently in form (inside prose or a fence, cut off, extra fields) but strictly in type: `continuation` must be a string, or the reply is withheld as `format`, the only withheld reason.

The server then adjusts only what is never ambiguous (`server/assist/postprocess.py`, `join`):
- no space after a space;
- one space after punctuation;
- the unfinished word written again from its start is dropped ("proce" + "Processed yet." → "ssed yet.").

The existing checks then apply: one line, one sentence, 20 words, the same script, no restating of the prefix's tail. A join the model makes inside a word is shown as written. It isn't checked against a dictionary, so a repeated or dropped letter can reach the agent ("التفا" + "اصيل" reads "التفااصيل"; see `docs/known-issues.md` KI-6).

The reply carries the suggestion as `completion`, and an `edit: { typed, word, rest }` derived by the server: `typed` is the prefix's trailing letters, `word` is `typed` plus the completion's leading letters when it joins, and `rest` is what follows. A host can tell "complete the word" from "start a new one" without re-deriving it, and `completion == word.slice(typed.length) + rest` always holds.

## Events

- `completion-shown`: carries the latency and the shown length.
- `completion-accepted`: carries the accepted length, which counts every character accepted or typed through. A suggestion that was partly accepted word by word and then abandoned still ends as accepted.
- `completion-dismissed`: emitted otherwise.

The server records withheld suggestions itself. Only unusable model output (`format`) is withheld: suggestions aren't filtered for their content.

Events never contain the suggestion or the composer text. The server keeps only allowlisted fields.

## Testing seams

`env: { replace, measure, isMac }` replaces the browser edit path, the layout measurement (jsdom has no layout) and the platform check. See `test/completion/controller.test.ts`.
