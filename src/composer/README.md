# composer

**Composer integration layer** (architecture §3), Tier 1, browser, no network.

Spell checking and auto-correct for any `contenteditable` composer: the Agent Desktop chat `<div contenteditable="true">`, the email editor, or the demo stand-ins.

```ts
import { startSpellWorker } from '../spell/client';
import { createSpellService } from '../spell/service';
import { attachSpellCheck } from '../composer';
import { resolveMode } from '../policy';

const policy = { mode: 'auto', languages: ['en', 'ar'], agentMayLower: true, customDictionary: ['GOSI'] };
const mode = resolveMode(policy, agentPreference);   // 'off' | 'suggest' | 'auto'
const service = createSpellService(startSpellWorker(), {
  languages: policy.languages,
  customWords: policy.customDictionary,             // added to the engine at load
});
const handle = mode === 'off' ? undefined : attachSpellCheck(composerElement, {
  service,               // shared by every composer (one cache, one worker)
  mode,                  // 'suggest' or 'auto'; don't attach for 'off'
  languages: policy.languages,
  customWords: policy.customDictionary,
  onEvent: (e) => {},    // autocorrect / revert / accept / ignore; nothing is stored or sent
  debounceMs: 150,
  shortcut: 'Ctrl+.',    // opens suggestions (or Revert) for the word at the caret
});
// later
handle.detach();         // removes every effect on the host
```

## What it does to the host

- **Underlines:** drawn with the CSS Custom Highlight API (`::highlight(bp-spelling-error)`) over live `Range`s. Nothing is written into the editable DOM, so underlines can't reach the sent message or the undo history.
- **Style:** adds one `<style data-bp-spell>` to `<head>`, shared by all composers and removed after the last detach.
- **Spellcheck attribute:** sets `spellcheck="false"` once any language is ready. `detach` restores the original attribute, or removes it if it wasn't there.
- **Popover:** appends a `[data-bp-spell-popover]` element to `<body>` while suggestions are open. While it's open, ↑ ↓ Enter Escape are captured at window level, so the host never sees them (in chat, Enter would otherwise send).
- **Accepting a suggestion or auto-correcting:** selects the word and runs `document.execCommand('insertText')`. That's one native undo step, the host gets ordinary `beforeinput`/`input` events, and the formatting at the word is kept. After an auto-correction, the caret is put back where the agent was typing.
- **Flash:** an auto-correction is highlighted for about 2 s with `::highlight(bp-autocorrected)`, again without touching the editable DOM.

## Behavior

- **What gets checked:** only *settled* words (the caret has left them). A word the caret moves back into keeps an underline it already had.
- **Arabic:** a word counts as correct as written, or with diacritics and tatweel removed. Hamza and alef variants are never folded, so hamza errors stay flagged.
- **Ignore:** hides the word in that language for this composer until the page reloads.
- **Exclusions:** URLs, emails, tokens with digits, `$(substitution.fields)`, mixed-script tokens and single letters are never checked (see `src/tokenizer`).

## Auto-correct (`mode: 'auto'`)

- **Trigger:** only the word just completed by a **single typed boundary** (space, punctuation incl. ، ؛ ؟, line break, new paragraph). Never on Enter-to-send (the host cancels it), paste, host insertions (predefined messages, emoji), caret moves, undo or IME composition.
- **Confidence** (`src/autocorrect/confidence.ts`): exactly one engine suggestion is a single edit away (with adjacent swaps; Arabic compared without diacritics; spaced or hyphenated suggestions disregarded); at least 4 letters for English or 3 for Arabic; same first letter (Arabic alef forms ا أ إ آ count as one for this test only); same script; not all caps, ignored, or a custom word. Capitalization is preserved. Anything less certain stays an underline.
- **Revert:** one Undo, or click the corrected word and choose "Revert to *original*". Either way the original goes on the session ignore list, so it isn't corrected or underlined again.
- **Typo corpus:** `test/autocorrect/corpus.test.ts` requires at least the expected fixes (19 of 30 English, 5 of 20 Arabic) and that none is fixed wrongly. Retune against it.
- **Known issue:** confidence reads Hunspell's time-limited suggestions, so it can get more aggressive under CPU load. See `docs/known-issues.md` (KI-1).

## Testing seams

`env: { highlights, replace, rectOf }` replaces the browser APIs that jsdom lacks. See `test/composer/fakes.ts`.
