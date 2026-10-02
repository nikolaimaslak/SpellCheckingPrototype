# composer

**Composer integration layer** (architecture §3), Tier 1, browser, no network.

Suggest-only spell checking for any `contenteditable` composer: the Agent Desktop chat `<div contenteditable="true">`, the email editor, or the demo stand-ins.

```ts
import { startSpellWorker } from '../spell/client';
import { createSpellService } from '../spell/service';
import { attachSpellCheck } from '../composer';

const service = createSpellService(startSpellWorker()); // loads English, then Arabic
const handle = attachSpellCheck(composerElement, {
  service,               // shared by every composer (one cache, one worker)
  languages: ['en', 'ar'],
  enabled: true,         // false: attach nothing (stand-in for the tenant flag)
  debounceMs: 150,
  shortcut: 'Ctrl+.',    // opens suggestions for the word at the caret
});
// later
handle.detach();         // removes every effect on the host
```

## What it does to the host

- **Underlines:** drawn with the CSS Custom Highlight API (`::highlight(bp-spelling-error)`) over live `Range`s. Nothing is written into the editable DOM, so underlines can't reach the sent message or the undo history.
- **Style:** adds one `<style data-bp-spell>` to `<head>`, shared by all composers and removed after the last detach.
- **Spellcheck attribute:** sets `spellcheck="false"` once any language is ready. `detach` restores the original attribute, or removes it if it wasn't there.
- **Popover:** appends a `[data-bp-spell-popover]` element to `<body>` while suggestions are open. While it's open, ↑ ↓ Enter Escape are captured at window level, so the host never sees them (in chat, Enter would otherwise send).
- **Accepting a suggestion:** selects the word and runs `document.execCommand('insertText')`. That's one native undo step, the host gets ordinary `beforeinput`/`input` events, and the formatting at the word is kept.

## Behavior

- **What gets checked:** only *settled* words (the caret has left them). A word the caret moves back into keeps an underline it already had.
- **Arabic:** a word counts as correct as written, or with diacritics and tatweel removed. Hamza and alef variants are never folded, so hamza errors stay flagged.
- **Ignore:** hides the word in that language for this composer until the page reloads.
- **Exclusions:** URLs, emails, tokens with digits, `$(substitution.fields)`, mixed-script tokens and single letters are never checked (see `src/tokenizer`).

## Testing seams

`env: { highlights, replace, rectOf }` replaces the browser APIs that jsdom lacks. See `test/composer/fakes.ts`.
