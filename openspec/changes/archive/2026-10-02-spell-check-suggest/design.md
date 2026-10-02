# Design

## Context

What exists (see proposal.md, Why, for motivation): `src/spell/` has the WASM engine, a pure request handler, the worker shell and an id-matching `SpellClient`. `src/demo/` has a `plaintext-only` chat stand-in, a `contenteditable` email stand-in and a status indicator. The Arabic dictionary is fetched into gitignored `.local-dicts/ar/` and gated out of builds by a Vite plugin.

Observed on the real Agent Desktop (dev tenant, customer chat interaction, October 2, 2026):
- **Composer element:** `<div contenteditable="true" placeholder="type message here">` (GWT), `white-space: normal`, `direction: ltr` from CSS with no `dir` attribute, `unicode-bidi: isolate`, `max-height: 262px`, `overflow-y: auto`.
- **Surrounding controls:** Insert Emoji, predefined message, KB search, attachment, co-browse.
- **Hidden `<textarea class="gwt-TextArea">`:** sits offscreen at (-200, -200) and is GWT's auto-height measuring helper, not an editor.
- **Platform:** no CSP header or meta tag, blob-URL workers run, `WebAssembly.instantiate` works, and `CSS.highlights` exists.

Checked `Intl.Segmenter('und', {granularity: 'word'})` on Node 25 (ICU, same family as Chrome):
- **Handled correctly:** keeps "don't", "والكتاب" and "مَرْحَبًا" whole, and drops emoji.
- **Problems:** splits "CS-104233" into "CS" + "104233", returns "user.firstName" from `$(user.firstName)`, and returns "GOSIنظام" as one word.

## Goals / Non-Goals

**Goals:**
- One composer-agnostic module that works on the real GWT composer unchanged, with no host DOM rewrites.
- Exactly one way to change text (native editing path), so undo and host models stay correct.
- English usable before Arabic finishes loading (Arabic is about 1 s).

**Non-Goals:**
- Pixel-perfect popover styling. It inherits the host font and uses neutral colors.
- Incremental re-tokenizing of only the changed blocks. A full re-tokenize per debounce is cheap at composer sizes (chat is capped at 262 px tall). Revisit only if the 300-word paste check shows a problem.

## Decisions

### 1. Tokenizer: flatten, mask, segment, map back (Tier 1, `src/tokenizer/`)
`buildTextMap(root)` walks the composer in document order and produces a flat string plus a segment table `{node, nodeStart, flatStart, length}` for every text node.
- `<br>`, block elements (`div`, `p`, `li`) and `<img>` (emoji) append a `\n` or U+FFFC separator, which has no node mapping.
- That gives the required boundaries, while inline formatting (`<b>rec</b>eive`) concatenates into one word.

`tokenize(map, caretFlatOffset?)` then works in four steps:
1. **Mask exclusions on whole runs of non-space text**, using regexes on the flat string, before segmenting: URL (`\bhttps?://\S+|\bwww\.\S+`), email, `\$\([^)]*\)`, and *any non-space run containing `\p{Nd}`* (trailing punctuation trimmed). Masked spans are replaced by spaces of equal length, so offsets stay stable. This is what makes "CS-104233" disappear as a unit instead of leaving "CS".
2. **Segment** with `Intl.Segmenter` and keep `isWordLike` segments.
3. **Tag the language by script:** all letters `\p{Script=Arabic}` → `ar`; all letters `\p{Script=Latin}` → `en`; mixed → excluded. Single-character tokens are skipped (avoids "e" from "e-mail").
4. **Settledness:** `pending = caret !== undefined && start < caret && caret <= end`.

Each token gets a live `Range` built from the segment table: start node/offset to end node/offset, which may span nodes. Pure functions, unit-tested in jsdom.

### 2. Arabic correctness in the worker (Tier 1, `src/spell/arabic.ts` + handler)
For `ar`, a word is correct if `spell(raw) || spell(stripMarks(raw))`, where `stripMarks` removes tashkeel (U+064B–U+065F, U+0670, U+06D6–U+06ED) and tatweel (U+0640). Suggestions are requested for the stripped form.

**Deviation from the architecture doc:** it lists "alef variants folded" as part of normalization. Folding is *not* used for correctness, because a missing or wrong hamza (أ/إ/آ → ا) is one of the most frequent Arabic spelling errors, and folding would silently accept it. Hunspell's own suggestions already offer the hamzated form. Folding can return later as a suggestion-ranking signal (Phase 2 confidence layer).

### 3. Batch check request (Tier 1, `src/spell/protocol.ts`, `handler.ts`)
New request `{id, type: 'check', words: Partial<Record<Lang, string[]>>}` → result `{misspelled: Partial<Record<Lang, string[]>>, unchecked: Partial<Record<Lang, string[]>>}`. Words for an unloaded language go to `unchecked`. One round trip per debounce, whatever the edit size.

### 4. Spell service with shared cache and staged loading (Tier 1, `src/spell/service.ts`)
`createSpellService(client)` wraps `SpellClient`:
- **Staged loading:** sends `load ['en']`, then `load ['ar']`, as two requests, so English is usable at about 90 ms.
- **Readiness:** exposes `onReady(lang)` events and a combined `status` for the demo indicator.
- **Cache:** keeps a per-language `Map<word, boolean>` shared by every attached composer, so the same word is never checked twice.

### 5. Composer layer (Tier 1, `src/composer/`)
`attachSpellCheck(el, { service, languages, enabled, debounceMs = 150, shortcut = 'Ctrl+.' })` returns `{ detach }`.

- **Triggers:**
  - `input` on the element covers typing, paste, and the host's emoji and predefined-message insertion via `execCommand`.
  - A `MutationObserver` with `characterData`, `childList` and `subtree` catches host writes that fire no `input` event, such as GWT clearing the composer on send.
  - `selectionchange` re-evaluates settledness.
  - All of them go through one debounced `recheck()`.
- **Recheck:** tokenize, then find settled tokens in enabled languages that aren't on the ignore list. Cache hits resolve immediately and misses go out in one batch. A generation counter drops stale replies. The flagged set keeps the previous flag for any token whose text and position are unchanged, even if it is now pending; that's how the caret-inside-underline scenario holds.
- **Rendering (no editable-DOM writes):**
  - **Highlight:** one module-level `Highlight` registered as `CSS.highlights.set('bp-spelling-error', …)`, holding the live Ranges from every attached composer. Each composer owns a `Set<Range>` and swaps its ranges in and out.
  - **Style:** one `<style>` element with `::highlight(bp-spelling-error){ text-decoration: wavy underline #d93025; text-decoration-skip-ink: none }`, injected into `document.head` with reference counting.
  - **Why live ranges:** they shift with edits between checks, so underlines stay on the right words.
  - **RTL:** highlights paint on text runs, so Arabic under the host's LTR base direction still underlines exactly the glyphs of each word.
- **Opening the popover:**
  - **By click:** on `mouseup` with a collapsed selection inside a flagged token's Range (`Range.isPointInRange`).
  - **By keyboard:** the shortcut with the caret inside a flagged token.
  - **Why not hit-test the highlight:** `highlightsFromPoint` isn't widely available, so caret-based lookup is used instead.
- **Popover** (`src/composer/popover.ts`):
  - **Placement:** a `position: fixed` element appended to `document.body`, outside the editable region, anchored to `range.getBoundingClientRect()` and flipped above the word near the viewport bottom.
  - **Direction:** `dir="rtl"` for `ar` tokens and `ltr` for `en`.
  - **Semantics:** `role="listbox"`, options with `role="option"`, at most 5 suggestions plus "Ignore". Suggestions are fetched when the popover opens.
  - **Selection:** `mousedown` calls `preventDefault`, so the composer's selection survives.
  - **Keyboard capture:** while the popover is open, a `keydown` listener on `window` in the **capture phase** handles ↑/↓/Enter/Escape and calls `stopImmediatePropagation()`. This is essential in chat, where Enter otherwise sends, and the host's handlers run later in propagation.
- **Accepting a suggestion:**
  1. Check that the token Range's text still equals the flagged word; if not, abort.
  2. Select that Range.
  3. Run `document.execCommand('insertText', false, suggestion)`.

  This is the single text-change path. It creates one native undo step, fires `beforeinput` and `input` so GWT's model sees a normal edit, inherits the formatting at the start of the word (bold stays bold), and leaves the caret after the inserted text. No direct DOM mutation is ever used for replacements.
- **Native spellcheck handover:** record the original `spellcheck` attribute at attach time. Set `spellcheck="false"` when the service first reports any language ready. `detach` restores the original value, or removes the attribute if there was none.
- **Ignore:** a `Set` of `lang:word` per composer. "Ignore" adds the word and triggers a recheck.
- **Detach:** removes listeners, the observer, the composer's ranges from the shared Highlight, the popover, and the style once the reference count reaches zero.

### 6. Arabic dictionary vendored (config/build, `dicts/ar/`, `scripts/fetch-dicts.ts`)
- **Vendoring:** commit `dicts/ar/ar.aff`, `dicts/ar/ar.dic` (the bytes already pinned at `32b006a2`, same sha256) and `dicts/ar/NOTICE` (AyaSpell, upstream, tri-license, MPL 1.1 election, Debian `hunspell-ar` copyright as the license source).
- **`fetch-dicts`:** becomes fully offline. It copies English from `node_modules`, verifies the Arabic hashes, and copies to `public/dicts/ar/`. A mismatch throws naming the file, through the existing `verifyAndPlace`.
- **Removals:** the download code, `--en-only`, the Vite `arabicDictionary` plugin and the `.local-dicts/` ignore entry.
- **Hooks:** the npm `pre*` hooks now provision both languages.
- **Docs:** update `openspec/config.yaml` licensing context, `CLAUDE.md`, `README.md` and `dicts/MANIFEST.md`.
- *Alternative: keep downloading at setup.* Rejected: builds would need network access, and Arabic tests would skip on offline machines.

### 7. Demo changes (demo harness, `src/demo/`)
- **Chat stand-in:**
  - becomes `contenteditable="true"` with `white-space: normal`
  - Enter sends `innerText`, with a jsdom `textContent` fallback
  - the emoji button inserts "😊", and the predefined-message menu inserts an English or Arabic phrase, both via `execCommand('insertText')`, as the host does
- **Fidelity toggle:** removes `dir="auto"` and sets `direction: ltr` on the chat composer.
- **Spell toggle:** calls attach and detach on both composers.
- **Status indicator:** now driven by `service.status`.

### 8. Dev-only Agent Desktop loader (dev only, never shipped; `dev/ad-loader/`)
- **Build and serve:** a separate Vite build (`npm run ad-loader`) produces `ad-spell.js` (IIFE) and `ad-spell-worker.js` (classic worker IIFE), served together with `hunspell.wasm` and the dictionaries by a small static server on `http://localhost:5174` with CORS headers.
- **Loading it:** in the Agent Desktop DevTools console, run `import('http://localhost:5174/ad-spell.js')`.
- **Worker bootstrap:** the loader creates the worker as `new Worker(URL.createObjectURL(new Blob(['importScripts("http://localhost:5174/ad-spell-worker.js")'])))`. Cross-origin `importScripts` is allowed in classic workers, and the tenant allows blob workers. The worker fetches the WASM and dictionaries from the loader origin with CORS.
- **Attaching:** to every `div[contenteditable="true"]` inside the chat composer container. A `MutationObserver` on `body` attaches to composers created later, since GWT builds one per interaction. `window.__bpSpell.detachAll()` undoes everything.
- **Isolation:** the loader is excluded from `npm run build` output and lives under `dev/`.

### Tier map
| Component | Tier |
|---|---|
| `src/tokenizer/*` | Tier 1 (browser, page thread, pure) |
| `src/spell/arabic.ts`, batch check in `handler.ts` | Tier 1 (worker) |
| `src/spell/service.ts` | Tier 1 (page thread, no engine work) |
| `src/composer/*` | Tier 1 (page thread, host integration) |
| `dicts/ar`, `scripts/fetch-dicts.ts` | build/config |
| `src/demo/*` | demo harness |
| `dev/ad-loader/*` | dev only, never shipped |

### Testing approach
jsdom has no `CSS.highlights`, `Highlight`, layout, or `execCommand` editing. So:
- **Seams:** the composer layer takes injectable seams (`highlights` registry, `editor.replace(range, text)`, `rectOf(range)`) that default to the real browser APIs.
- **Unit tests (jsdom):** the tokenizer, Arabic normalization, batch check (Node with the real engine and both dictionaries), the service cache, and composer logic with fakes: flagging, pending retention, ignore, detach cleanup, keyboard capture, stale-reply dropping.
- **Real-browser checks:** painting, popover placement, RTL, native undo and host `input` events are checked on the demo page in Chrome with scripted checks (as in `repo-scaffold`), then once on the real Agent Desktop through the loader.

## Risks / Trade-offs

- [GWT may not update its model from `input` events, for example if it syncs on key events] → `execCommand('insertText')` is the same path the browser uses for typing and IME commits, so GWT must already handle it. The Agent Desktop loader check (send a corrected message in an internal chat, then confirm the sent text) verifies this before the change is called done.
- [GWT may replace the composer's DOM wholesale (for example on send)] → Live Ranges collapse safely, and the `MutationObserver` triggers a fresh tokenize.
- [`execCommand` is deprecated] → It remains the only API that produces native undo steps and host-visible input in `contenteditable`. All uses go through the single seam (`editor.replace`), so it can be swapped when a successor (for example `EditContext`) is viable.
- [The keyboard shortcut `Ctrl+.` may collide with a host or OS shortcut] → It is configurable, and the default is checked on the Agent Desktop loader run.
- [Loading `http://localhost` from the HTTPS tenant may trigger Chrome's Local Network Access permission prompt] → Accept the prompt once on the dev machine. If blocked, use a DevTools Local Override that inlines the loader. Dev-only either way.
- [The hard-coded `direction: ltr` makes Arabic composition awkward (caret and punctuation placement) regardless of spell checking] → Out of scope. Reported as a product finding for Agent Desktop (`dir="auto"` on the composer would fix it).
- [Repository grows by about 7.3 MB] → Accepted for offline, reproducible builds. The dictionary changes rarely.
- [Full re-tokenize per debounce on long emails] → Measured in the 300-word paste check. If needed, limit tokenizing to changed blocks, which is a contained change inside `src/tokenizer`.

## Migration Plan

Developers delete any local `.local-dicts/` and stop using `INCLUDE_AR_DICT`. No deployed systems exist. Rollback means reverting the change's commits.

## Open Questions

- What element does the real Agent Desktop **email** editor use? It hasn't been observed yet. It doesn't change this change, which targets the email stand-in, but it decides whether a follow-up change is needed for email integration.
- Does Agent Desktop insert emoji as Unicode text or as `<img>`? Still unknown: the Insert Emoji control was hidden in the chat used for the loader run. The tokenizer handles both.

## Implementation Notes

- **Measured on the demo page (Chrome, October 2, 2026):**
  - Pasting a 300-word mixed Arabic and English paragraph into the email stand-in: `insertText` took 3 ms; a full recheck took 5 ms cold (tokenize, worker batch round trip, render) and 3 ms warm. A `PerformanceObserver` saw no main-thread long tasks over 50 ms. The 4 planted misspellings, and only those, were flagged.
  - Underlines settle about 155 ms after typing stops (150 ms debounce plus a few ms). Arabic loads in about 0.9–2.3 s after English is already usable.
  - Background tabs: Chrome throttles timers in hidden tabs, so the debounce can stretch to 1 s or more there. Acceptable, since the agent is looking at the composer.
- **AyaSpell's `.aff` has `IGNORE ًٌٍَُِّْـٰ`,** so Hunspell already accepts vowelled and tatweel forms. `stripMarks` is a safety net that also covers dictionaries without IGNORE.
- **Popover dismissal:** Escape keeps focus and caret in the composer, while clicking elsewhere lets focus go where the agent clicked (spec scenarios refined accordingly).
- **Real Agent Desktop run** (dev tenant, October 2, 2026, through `dev/ad-loader`):
  - **Loading:** English loaded in 41 ms and Arabic in 412 ms. The loader attached to all `contenteditable` editors (chat composers and the notes editor) and set `spellcheck="false"`.
  - **Checking:** "recieve" and "اذا" were flagged in the GWT composer with no markup added. The popover flips above the word because the composer sits at the window bottom. Arabic gets a right-to-left popover offering "إذا".
  - **Accepting:** fires exactly one `input` event. Undo restores the word, and Escape closes the popover. Agent Desktop's own key handling never saw the popover's Enter.
  - **Sending:** a message whose typo was fixed through the popover was sent with Enter and arrived as "Spell check test: I will receive it", with no underline markup. GWT read the corrected text from the composer, so `execCommand('insertText')` is compatible with its model.
  - **Cleanup:** `__bpSpell.detachAll()` restored every editor's original `spellcheck` state and removed all highlights, styles and popovers.
- **Loader gotcha:** Chrome's Local Network Access prompt must be accepted first. A dynamic `import()` that failed before the prompt was accepted stays cached as failed for that URL, so add a cache-busting query (`?v=…`) when retrying.
