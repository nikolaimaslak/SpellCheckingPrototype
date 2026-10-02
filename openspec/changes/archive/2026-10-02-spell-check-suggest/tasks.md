# Tasks

## 1. Arabic dictionary vendored under MPL 1.1

- [x] 1.1 Copy the pinned `ar.aff`/`ar.dic` into `dicts/ar/` and add `dicts/ar/NOTICE` (AyaSpell, LibreOffice `dictionaries` commit `32b006a2`, GPL-2+/LGPL-2.1+/MPL-1.1 with MPL 1.1 elected, Debian `hunspell-ar` copyright as the license source); verify `shasum -a 256 dicts/ar/*.{aff,dic}` matches the pinned hashes
- [x] 1.2 Rework `scripts/fetch-dicts.ts` to be fully offline: English from `node_modules`, Arabic verified with `verifyAndPlace` against the pinned hashes and copied to `public/dicts/ar/`; remove the download code and `--en-only`; verify a re-run gives byte-identical output, and that it works with networking blocked (`NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:9`)
- [x] 1.3 Update `test/scripts/fetch-dicts.test.ts` for the tamper case against the committed-file path (a mismatching file is not copied and the error names it); verify `npm test`
- [x] 1.4 Remove the `arabicDictionary` Vite plugin and the `.local-dicts/` gitignore entry, and point the npm `pre*` hooks at the full `fetch-dicts`; verify `npm run build` output contains `dicts/en` and `dicts/ar` with no flags
- [x] 1.5 Switch the Arabic engine test from `.local-dicts` to the vendored `dicts/ar` and drop its `skipIf`; verify all Arabic tests run (none skipped)
- [x] 1.6 Update `dicts/MANIFEST.md` (Arabic: MPL 1.1 elected, redistributable yes), the licensing paragraph of `openspec/config.yaml` context, and the licensing sections of `CLAUDE.md` and `README.md`; verify `grep -rn "INCLUDE_AR_DICT\|local-dicts\|pending legal" --exclude-dir=node_modules --exclude-dir=archive .` returns nothing outside `openspec/changes/`

## 2. Tokenizer

- [x] 2.1 Implement `buildTextMap(root)` in `src/tokenizer/textmap.ts` (flat string, segment table, `\n`/U+FFFC separators for `br`, blocks and `img`); verify with `test/tokenizer/textmap.test.ts` (jsdom): `<b>rec</b>eive` maps to "receive" across two nodes, and `br`, `div` and `img` produce separators
- [x] 2.2 Implement exclusion masking (URL, email, `$(...)`, any non-space run containing `\p{Nd}`, trailing punctuation trimmed, offsets preserved); verify with unit tests for each spec example, including "CS-104233", "١٢٣٤٥" and `$(user.firstName)`
- [x] 2.3 Implement `tokenize(map, caret?)`: `Intl.Segmenter` word-like segments, script tagging (`ar`, `en`, mixed excluded), single-character skip, live `Range` per token across nodes, and the `pending` flag; verify with `test/tokenizer/tokenize.test.ts` covering every text-tokenizer spec scenario (English, formatting split, boundaries and emoji, "don't", Arabic sentence, clitics, diacritics and tatweel, mixed sentence, mixed-script token, settled and pending cases)

## 3. Worker: Arabic correctness and batch check

- [x] 3.1 Implement `src/spell/arabic.ts` `stripMarks` (tashkeel U+064B–U+065F, U+0670, U+06D6–U+06ED, tatweel U+0640; no alef folding); verify with unit tests ("مَرْحَبًا" → "مرحبا", "مرحـــبا" → "مرحبا", hamza letters unchanged)
- [x] 3.2 Add the `check` request to `protocol.ts` and `handler.ts` (raw-then-stripped for `ar`, `unchecked` for unloaded languages), and make `suggest` for `ar` use the stripped form; verify with `test/spell/handler.test.ts`: the mixed batch from the spec returns only "recieve", an unloaded language is reported unchecked, vowelled and tatweel forms are correct, and a hamza-error word is flagged with the hamzated form in its suggestions (pick a concrete word by probing the dictionary and record it in the test)
- [x] 3.3 Implement `src/spell/service.ts` (staged `load en` then `load ar`, per-language ready events, combined status, shared per-language cache, a single batch per call); verify with `test/spell/service.test.ts` using a fake `SpellPort`: English becomes ready before Arabic, cached words are not re-sent, and two composers share the cache

## 4. Composer spell check

- [x] 4.1 Create `src/composer/highlights.ts` (shared `bp-spelling-error` Highlight, per-owner range sets, ref-counted `<style>` injection) with an injectable registry; verify with unit tests using a fake registry: two owners add and remove independently, and the style is removed after the last release
- [x] 4.2 Implement `attachSpellCheck` core in `src/composer/attach.ts`: `input`, `MutationObserver` and `selectionchange` triggers, debounce, recheck with generation counter, flagged set that keeps unchanged pending words, ignore set, enabled and languages options, `detach`; verify with `test/composer/attach.test.ts` (jsdom, fake service and registry): misspelled settled words flagged, pending word not flagged, flag kept when the caret enters an unchanged flagged word, stale reply dropped, disabled attaches nothing, ignore unflags every occurrence, detach removes everything
- [x] 4.3 Add the native spellcheck handover (record the original attribute, set `false` on first ready, restore on detach, untouched if nothing loads); verify with unit tests for ready, failed and detach (attribute originally absent vs `"true"`)
- [x] 4.4 Implement `src/composer/popover.ts`: body-level fixed element, anchored and flipped placement through a `rectOf` seam, `dir` per language, up to 5 suggestions plus "Ignore", a "no suggestions" state, `mousedown` preventDefault, window capture-phase `keydown` for ↑/↓/Enter/Escape with `stopImmediatePropagation`, outside-click dismiss that restores the caret; verify with `test/composer/popover.test.ts` (jsdom): Arabic popover `dir="rtl"`, Enter picks the focused option and a host `keydown` listener on the composer does **not** receive the Enter, Escape closes without text changes
- [x] 4.5 Wire opening (click: `mouseup` with collapsed caret in a flagged range; keyboard: configurable `Ctrl+.`) and accepting (re-verify the word text, select the range, `editor.replace` seam defaulting to `execCommand('insertText')`, then recheck); verify with unit tests through a fake `editor.replace`: called once with the right range and text, aborted if the word changed since opening
- [x] 4.6 Export the public API from `src/composer/index.ts` (`attachSpellCheck`, option types) and document it in `src/composer/README.md` (replacing the placeholder); verify `npm run typecheck`

## 5. Demo harness

- [x] 5.1 Convert the chat stand-in to `contenteditable="true"` with `white-space: normal`, Enter sending `innerText` (with a `textContent` fallback) as plain text, and Shift+Enter inserting a line break; update `test/demo/chat.test.ts` (send, Shift+Enter, empty, Arabic) and verify it passes
- [x] 5.2 Add the emoji button and the predefined-message menu (English and Arabic phrases) inserting at the caret via `execCommand('insertText')` and keeping focus; verify by a scripted check in Chrome on the demo page (insert both, then confirm composer text and `document.activeElement`)
- [x] 5.3 Add the "Agent Desktop fidelity" toggle (chat composer `direction: ltr`, no `dir="auto"`); verify by a scripted check in Chrome: with fidelity on, the composer's computed direction is `ltr` while an Arabic word's glyph order is still RTL (via range rects)
- [x] 5.4 Create the spell service in `main.ts`, attach to both composers, drive the status indicator from `service.status`, and add the spell on/off toggle; update `test/demo/status.test.ts` for staged readiness and verify it passes
- [x] 5.5 Scripted Chrome check of composer-spell-check on the demo page: "I will recieve it " is underlined only on "recieve" (via `CSS.highlights`); an Arabic misspelling and the "GOSSI" mixed sentence flag only the wrong words; "مَرْحَبًا " and "مرحـــبا " are not flagged; spellcheck becomes `false` after ready; the toggle-off removes all ranges and restores spellcheck
- [x] 5.6 Scripted Chrome check of the popover and acceptance: clicking an underlined word opens the popover next to it (Arabic one is RTL); keyboard `Ctrl+.` opens it; accepting "receive" gives "I will receive it" with the caret after the word, an `input` listener fires once, and one `document.execCommand('undo')` restores "recieve"; in chat, Enter inside the popover does not send; in email, a fix inside bold text stays bold
- [x] 5.7 Responsiveness check on the demo page: paste a 300-word mixed Arabic and English paragraph, and confirm with a Performance trace (or `performance.now()` around `recheck`) that no main-thread task exceeds 50 ms during the paste and the following recheck; record the numbers in design.md

## 6. Real Agent Desktop check (dev only)

- [x] 6.1 Build `dev/ad-loader/` (loader IIFE, classic worker IIFE, `npm run ad-loader` static server on :5174 with CORS serving the loader, worker, WASM and dictionaries; attach to existing and future `div[contenteditable="true"]` chat composers; `window.__bpSpell.detachAll()`); verify `npm run build` output contains nothing from `dev/`, and the loader starts and serves the files (`curl -I` shows CORS headers)
- [x] 6.2 With the user, on the dev tenant: load the loader from the DevTools console, type a misspelled English and Arabic sentence in the chat composer **without sending**, and confirm underlines, popover, acceptance, undo and the `Ctrl+.` shortcut work and the composer's `spellcheck` is `false`; record how emoji are inserted (Unicode or `<img>`) in design.md Open Questions
- [x] 6.3 With the user's explicit go-ahead for sending (internal chat preferred): accept a suggestion and send, then confirm the sent message has the corrected text and no underline markup; run `__bpSpell.detachAll()` and confirm the composer is back to its original state

## 7. Integration

- [x] 7.1 Fresh-copy check (tracked files only, in a temp directory): `npm install && npm test && npm run build` pass offline after install, no tests are skipped, and `dist/` contains both dictionaries
- [x] 7.2 Run `openspec validate spell-check-suggest --strict` and confirm it passes
- [x] 7.3 Rewrite the `## Purpose` of `openspec/specs/dictionary-provisioning/spec.md` (deltas can't change a Purpose) so it no longer describes the Arabic licensing guard: "Defines how the English and Arabic dictionaries reach the spelling engine offline, with pinned, verified, redistributable sources"; verify `openspec validate --specs` passes
