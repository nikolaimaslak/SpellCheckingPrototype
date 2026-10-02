# Proposal

## Why

In PER #60254, GOSI asked for *automatic correction of clear spelling mistakes while the agent is typing*, with suggestions *when the system is not fully confident*, and for the feature to be *enforceable and configurable by the administrator*. Phase 1 (`spell-check-suggest`) delivered the suggest half. This change adds the automatic half, with the controls an administrator needs so auto-correct can't mangle GOSI terminology and can be turned off or limited tenant-wide.

**Serves:** PER #60254, delivery phase 2 (auto-replace via confidence layer, custom dictionary, mode enforcement).

## What Changes

- **Confidence layer.** When the agent types a boundary character (space, punctuation, line break) right after a misspelled word, the word is auto-replaced only if all of these hold:
  - exactly one engine suggestion is a single edit away (insert, delete, substitute or swap two adjacent letters);
  - the word is long enough;
  - the word starts with the same letter as the replacement;
  - the word and replacement are in the same script;
  - the word isn't all caps, ignored, or in the custom dictionary.

  Everything else stays an underline with suggestions. No word-frequency data is used. Suggestions containing spaces or hyphens the word didn't have are disregarded.
- **Never on send, paste or insertion.** Auto-correct fires only for a single boundary character typed while composing. It never fires on Enter-to-send, on paste, on text the host inserts (predefined messages, emoji), when the caret is moved away, or when IME composition ends. The agent sees every automatic change before the message can go out.
- **Visible, revertible changes.** Each replacement briefly flashes and stays revertible:
  - one Undo restores the original word;
  - clicking the corrected word offers "Revert to *original*";
  - either way, the original is added to the session ignore list so it isn't corrected again.
- **Assistance policy (admin over agent).**
  - The admin policy sets the mode (`off`, `suggest` or `auto`), the enabled languages, whether agents may choose a less aggressive mode, and a custom dictionary.
  - The agent preference can only lower the mode, never raise it, and only when the admin allows it. One resolution function produces the effective mode.
- **Custom dictionary.** Admin-managed words (product names, GOSI terminology, transliterations) are added to the engine for their script when the language loads. They are never flagged and never auto-replaced, and they can appear as suggestions (for example "GOSSI" → "GOSI").
- **Assistance events.** Auto-correct, revert, suggestion-accepted and ignore events go to an optional callback for later tuning and the Phase 3 telemetry. Nothing is stored or sent by this change.
- **Demo harness.** A settings panel stands in for Contact Center Administrator (admin mode, agent-may-lower, custom dictionary) plus an agent preference control, and shows an event counter with acceptance and revert counts.
- **Dev loader.** Accepts the mode and custom words, so auto-correct can be tried on the real Agent Desktop.

## Non-goals

- Word-frequency ranking. That needs a license-clean frequency list and is deferred.
- Grammar or any Tier 2 or server call (Phase 4).
- Per-team or per-user policy scoping and real Contact Center Administrator integration. GOSI asked for global enable and disable; the policy is tenant-level, and the demo panel stands in for the admin UI.
- Persisting or uploading telemetry (Phase 3).
- Auto-correcting pasted or host-inserted text, or the word being sent.
- Agent-level "add to dictionary" (the custom dictionary is admin-managed).

## New third-party dependencies

None.

## Capabilities

### New Capabilities
- `auto-correct`: the confidence decision, when auto-replacement may and may not fire, how replacements are applied, shown, reverted and remembered, and the assistance events.
- `assist-policy`: admin policy and agent preference, effective-mode resolution, enabled languages, and custom-dictionary semantics.

### Modified Capabilities
- `composer-spell-check`: attach takes an effective mode (`suggest` or `auto`) instead of an enabled flag. "Suggest-only underlines" becomes "Underlines and text changes", allowing automatic changes only in `auto` mode under the `auto-correct` rules. The popover offers "Revert" for an auto-corrected word.
- `demo-harness`: adds the admin and agent settings panel and the event counter.

## Impact

- **New code:** `src/autocorrect/` (confidence, edit distance, trigger and apply), `src/policy/` (types and resolution).
- **Changed:** `src/composer/attach.ts` (modes, auto path, revert, events), `src/composer/popover.ts` (Revert item), `src/spell/service.ts` (custom words at load), `src/demo/*`, `dev/ad-loader/loader.ts`.
- **Host interaction:** auto-replacements use the same single text-change path as accepted suggestions (`execCommand('insertText')`), so each one is one native undo step and the host receives a normal `input` event. The caret is put back where the agent was typing.
