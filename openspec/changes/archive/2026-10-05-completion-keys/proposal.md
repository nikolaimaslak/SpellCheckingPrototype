# Proposal

## Why

Formal Req 3.2 asks for three ways to take a suggestion:
- **3.2.1:** accept all of it with Tab **and with Right Arrow at the end of the line**;
- **3.2.2:** accept it **one word at a time with Ctrl+Right Arrow**;
- **3.4:** the suggestion keeps updating after a partial accept.

Today only Tab accepts. Right Arrow is in the controller's navigation keys (`src/completion/controller.ts`), so it **dismisses** the suggestion, the opposite of what the requirement asks. There is no word-by-word accept. For Arabic, the "forward" arrow is Left Arrow, so a direction-blind mapping would be wrong for half the tenant's agents.

Serves **PER #60145** (auto-complete), formal Req 3.2.1, 3.2.2 and 3.4, **Phase 3**.

## What Changes

- **The forward arrow accepts the whole suggestion.** While ghost text is showing (which only happens at the end of a line), the arrow that points in the suggestion's reading direction accepts all of it, like Tab: Right Arrow for an English suggestion, Left Arrow for an Arabic one. This applies in the fixed left-to-right composer too, where Arabic ghost text sits on the line below. The other arrow, Up/Down, Home/End, and any arrow with Shift still dismiss as today.
- **Accept one word.** Ctrl + the forward arrow (Option + the forward arrow on macOS, where Ctrl+arrow belongs to the system) inserts the suggestion's next word: any leading spaces, then everything up to the next space. The rest stays visible and can be accepted word by word, with Tab or the forward arrow, or by typing through. Each word is one undo step.
- **The suggestion keeps updating.** Partial accepts consume the ghost text exactly like typing through it. Once it's fully used, the usual pause starts a new request, as after Tab today. No extra request is made while words remain.
- **Events.** A suggestion that was partly accepted word by word and then dismissed reports `completion-accepted` with the accepted length, not `completion-dismissed`, so the acceptance rate counts it. No text is sent, and there are no new fields, so the server's telemetry allowlist is unchanged.
- **Docs:** `docs/TESTING.md` gains scenarios for Right Arrow, Left Arrow on Arabic, and word-by-word accept. A new `src/completion/README.md`, like the other modules have, describes the keys and the suggestion lifecycle. The gap analysis is updated.

## Non-goals

- Accepting with the End key, or any key other than those in Req 3.2.
- Fetching a fresh suggestion after each accepted word while the current one still has words left. The current suggestion is still valid, so asking again would only add latency.
- The 200 ms latency budget (Req 3.5) and the completion safety filter (Req 3.7): separate changes.
- Changing when a suggestion is requested.

No new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `inline-completion`: "Accepting and ignoring" gains the direction-aware forward arrow and word-by-word accept, and no longer lists the forward arrow among the keys that dismiss. "Completion events" counts a partly accepted suggestion as accepted.

## Impact

- **Tier 1 code:** `src/completion/controller.ts` (key handling, word accept, partial-accept bookkeeping), and a small pure helper for the next word and the forward key (new `src/completion/keys.ts`).
- **Tests:** `test/completion/controller.test.ts`, and a new `test/completion/keys.test.ts`.
- **Docs:** `docs/TESTING.md`, the new `src/completion/README.md`, `docs/requirements/gap-analysis-60145-60254.md`.
- **No change** to the server, the telemetry schema, the spelling layer or the worker.
