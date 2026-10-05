# Tasks

## 1. Key classifier

- [x] 1.1 Create `src/completion/keys.ts` with `ghostKeyAction(e, dir, isMac)` and `nextWord(text)` (design D1). Verify with `test/completion/keys.test.ts`:
  - Tab → accept-all;
  - Right in `ltr` and Left in `rtl` → accept-all;
  - Ctrl+forward → accept-word (not on macOS), Alt+forward → accept-word (macOS only);
  - Alt+Left on Windows → dismiss;
  - backward arrow, Shift+arrow, Up, Down, Home, End, Page Up, Page Down, Enter → dismiss;
  - Escape → escape;
  - letters → none;
  - `nextWord(" will be processed")` = " will", `nextWord(" وسيتم الرد")` = " وسيتم", `nextWord(" days.")` = " days.", `nextWord("  ")` = "  ".

## 2. Controller

- [x] 2.1 In `src/completion/controller.ts`, replace the Tab/Escape/`NAV_KEYS` branches with `ghostKeyAction`, using the direction passed to `ghost.show()` and `isMac` read once at attach (overridable through `CompletionOptions.env.isMac`). `accept-all` → `accept()`; `accept-word` → `env.replace(caret, nextWord(ghost.text))`; both prevent the default and stop propagation. Verify with `test/completion/controller.test.ts`:
  - Right Arrow accepts an English suggestion and isn't seen by the host;
  - Left Arrow accepts an Arabic suggestion, also when the ghost is shown for a fixed-LTR composer;
  - the backward arrow and Shift+Right dismiss without being prevented;
  - Right Arrow without ghost text isn't prevented;
  - Tab still works.
- [x] 2.2 Word accept: verify with controller tests that two Ctrl+Right presses insert " will" then " be" through two `replace` calls, and the ghost then shows the rest. Also check:
  - Ctrl+Left on an Arabic suggestion inserts " وسيتم";
  - with `isMac`, Option+Right inserts a word and Ctrl+Right dismisses;
  - word accept, then typing " be", then Tab inserts the rest;
  - accepting the last word leaves no ghost and lets the next pause request a new completion;
  - no request is sent while words remain.
- [x] 2.3 Event bookkeeping (design D3: `consumed`, `wordAccepted`, Tab counts `consumed + remaining`). Verify with controller tests for the spec's event scenarios:
  - a 40-character suggestion, one 5-character word accepted, then diverging → one `completion-accepted` with shown length 40 and accepted length 5, and no `completion-dismissed`;
  - the forward arrow emits `completion-accepted` with the full length;
  - typing through 3 characters and then pressing Tab reports the full length;
  - events still contain no text.
- [x] 2.4 Auto-correct interplay: a composer test with spell checking in `auto` mode and completion attached. Accepting a suggestion word by word ends with a lone "." accepted after the correctly spelled word "days", and the text stays unchanged. Verify that it passes.

## 3. Docs

- [x] 3.1 Write `src/completion/README.md`: what the module does (trigger, ghost, controller), the keys (Tab, forward arrow by direction, word accept with Ctrl or Option, Escape, keys that dismiss), the suggestion lifecycle and events, and the test seams. Verify that it matches the delta spec and `keys.ts`.
- [x] 3.2 Update `docs/TESTING.md` T4:
  - Right Arrow accepts (English);
  - Left Arrow accepts (Arabic, also with **Agent Desktop fidelity**);
  - Ctrl+Right (Option+Right on Mac) twice accepts two words, and one Ctrl+Z removes the last word only;
  - Left Arrow on an English suggestion dismisses.

  Verify that the scenario numbering and the known limitations stay consistent.
- [x] 3.3 Update `docs/requirements/gap-analysis-60145-60254.md`: Req 3.2.1 and 3.2.2 → Met, Req 3.4 → Met (partial accept), and add the change to the "Done" list. Verify that the rows and the list are consistent.

## 4. Integration

- [x] 4.1 Manual check on the demo page: covered by 2.1–2.4 (controller tests for every key scenario, both directions, the fixed-LTR composer, macOS modifiers, events, and the auto-correct interplay), using the task's fallback as for the previous changes. The visual check is left to testers through `docs/TESTING.md` T4.9–T4.13.
- [x] 4.2 Run `npm run typecheck`, `npm test` and `npm run build`. Verify that all pass.
- [x] 4.3 Run `openspec validate completion-keys --strict`. Verify that it passes.
