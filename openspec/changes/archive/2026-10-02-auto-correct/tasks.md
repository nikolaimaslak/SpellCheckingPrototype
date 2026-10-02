# Tasks

## 1. Assistance policy

- [x] 1.1 Create `src/policy/` with `AssistMode`, `AdminPolicy`, `AgentPreference`, `DEFAULT_POLICY` (`suggest`, both languages, agent may lower, empty dictionary), `resolveMode(policy, pref)`, and `parsePolicy(unknown)` (field-by-field fallback to defaults); verify with `test/policy/policy.test.ts`: the full `resolveMode` truth table (agent lowers auto to suggest, can't raise suggest to auto, ignored when not allowed, `off` admin stays off) and `parsePolicy` on garbage, partial and valid input

## 2. Confidence rule

- [x] 2.1 Implement `src/autocorrect/distance.ts` `osa(a, b)` (optimal string alignment by code point); verify with table tests: identical 0, substitution, insertion, deletion and adjacent swap each 1, two edits 2, Arabic code points
- [x] 2.2 Export `languageOf` from the tokenizer, and implement `src/autocorrect/confidence.ts` `decide(word, lang, suggestions, ctx)` per design §1 (ignored, custom and all-caps rejection, mark stripping, space and hyphen filter, same script, exactly one single-edit candidate, minimum length 4 for en and 3 for ar, first-letter check with the Arabic alef class, capitalization preserved); verify with unit tests for every auto-correct "Confidence decision" scenario using fixed suggestion lists
- [x] 2.3 Corpus test `test/autocorrect/corpus.test.ts` (Node, real engine and dictionaries): the probe's 30 English and 20 Arabic typos produce exactly the expected auto-fix set (the 17 English listed in design.md Context plus occured→occurred and calender→calendar now that hyphen and split suggestions are filtered; the 5 Arabic), and every auto-fix equals its intended word; record the final counts in design.md

## 3. Engine-side support

- [x] 3.1 Change `createSpellService(requester, { languages, customWords })` to send one `add` per custom word of the matching script after each language loads and before publishing it as ready (skipping words with whitespace); update callers (`src/demo/main.ts`, `dev/ad-loader/loader.ts`, tests); verify with `test/spell/service.test.ts`: `add` requests are sent for "GOSI" (en) and "التأمينات" (ar) before the respective ready, and nothing is sent for a word with a space
- [x] 3.2 Integration test with the real handler (Node): after adding "GOSI" and "Absher", "GOSI" checks as correct, "GOSSI" gets "GOSI" among its suggestions, and `decide` on "Abshr" returns "Absher" (or, if the engine gives another single-edit candidate, the test documents that and asserts `null`)
- [x] 3.3 Add `SpellClient.terminate()` (terminates the worker and rejects pending requests); verify with a unit test using a fake port

## 4. Composer auto-correct

- [x] 4.1 Add `pointAt(map, offset)` to `src/tokenizer/textmap.ts` (flat offset → DOM point, end-of-segment affinity); verify with unit tests across formatting boundaries and at text end
- [x] 4.2 Implement `src/autocorrect/trigger.ts` `completedWord(event, map, caret, tokens)` per design §2; verify with jsdom tests using synthetic `InputEvent`s: typed space, Arabic "؟", `insertLineBreak` and `insertParagraph` fire; paste, multi-character insert, emoji, `historyUndo` and `isComposing` do not; only the immediately preceding word is returned
- [x] 4.3 Generalize `src/composer/highlights.ts` to named highlights (`bp-spelling-error` plus `bp-autocorrected` with a tinted background); update `test/composer/highlights.test.ts` for two names sharing one ref-counted style element, and verify it passes
- [x] 4.4 Change `AttachOptions`: `enabled` becomes `mode: 'suggest' | 'auto'`, and add `customWords` and `onEvent`; emit `accept` and `ignore` from the existing paths; update `test/composer/attach.test.ts` (the old "disabled" test moves to callers not attaching) and verify that in `suggest` mode "please seperate " is never changed
- [x] 4.5 Implement the auto pipeline in `attach.ts` (design §3: trigger → check → suggest → decide → re-validate → `env.replace` → caret restore via `pointAt` → record correction → 2 s flash → `autocorrect` event); verify with jsdom tests using a text-mutating fake `replace`: "please seperate " becomes "please separate ", the caret stays after further typed characters, nothing is applied if the word changed or the composer was cleared first, and paste and host insertion are untouched
- [x] 4.6 Implement revert: popover revert form ("Revert to *original*", RTL for ar) when the caret is inside a standing correction, `historyUndo` detection via the flat-start anchor, ignore on revert, and the `revert` event; add `onRevert`/revert-item support to `popover.ts`; verify with jsdom tests: popover revert restores the original through one `replace`, the reverted word is not corrected or flagged again, a correction edited since offers no Revert, and a simulated `historyUndo` that restores the original emits `revert` and ignores the word
- [x] 4.7 Update `src/composer/README.md` for modes, auto-correct rules, revert and events; verify `npm run typecheck`

## 5. Demo harness

- [x] 5.1 Build `src/demo/settings.ts` and its markup (admin mode, languages, agent-may-lower, custom dictionary, agent preference disabled unless allowed, effective mode display, Apply, `localStorage` with try/catch), wiring Apply to terminate the old service and re-attach with `resolveMode`; verify with `test/demo/settings.test.ts` (jsdom): the preference is disabled when not allowed, the effective mode shown follows `resolveMode`, and the settings round-trip through storage and survive a throwing `localStorage`
- [x] 5.2 Add the event counter (auto-corrections, reverts, accepted, ignored) fed by `onEvent`; verify with a jsdom test that dispatching events updates the counts
- [x] 5.3 Scripted Chrome check on the demo page in `auto` mode: typing "please seperate " gives "please separate " with the flash visible in `CSS.highlights.get('bp-autocorrected')` and gone after ~2 s; "I will recieve " is unchanged and underlined; "النضام " gives "النظام"; "اذا كان" gives "إذا كان"; "GOSSI " and "teh " are unchanged; Shift+Enter after a typo corrects it, while Enter (send) leaves it as typed in the transcript
- [x] 5.4 Scripted Chrome check of undo granularity: after an auto-correction in the middle of typing, one `document.execCommand('undo')` restores only the original word (not the agent's typing) and the revert counter increments; if Chrome merges undo groups, implement the design's group-break mitigation and re-run
- [x] 5.5 Scripted Chrome check of popover revert and policy: clicking an auto-corrected Arabic word shows an RTL "Revert to …"; choosing it restores the original, which is not corrected again; switching admin mode to `suggest` and applying stops further automatic changes; adding "GOSI" to the custom dictionary stops it being underlined

## 6. Dev loader

- [x] 6.1 Make `dev/ad-loader/loader.ts` read `window.__bpSpellConfig` (`mode`, `customDictionary`; default `suggest`) and pass them through `parsePolicy`/`resolveMode` to the service and attach; verify `npm run typecheck`, and that the loader on the demo page with `{ mode: 'auto' }` auto-corrects "please seperate "

## 7. Real Agent Desktop check (with the user)

- [x] 7.1 With the user's go-ahead, load the loader in `auto` mode on the dev tenant and type in the chat composer **without sending**: "please seperate " is corrected and flashes, one Undo restores it, and popover Revert works for an Arabic correction
- [x] 7.2 In the same session, listen for `input` events while the user (or I, with the user's explicit go-ahead to send in a chosen chat) presses Enter on "please seperate": record whether Agent Desktop fires `insertParagraph`/`insertLineBreak` before sending, confirm the sent text is exactly as typed, and if a boundary event did fire, implement the `sendOnEnter` fallback from design.md and re-check; finish with `__bpSpell.detachAll()`

## 8. Integration

- [x] 8.1 Fresh-copy check (tracked files only, temp directory): `npm install && npm test && npm run build` pass, with no skipped tests
- [x] 8.2 Run `openspec validate auto-correct --strict` and confirm it passes
