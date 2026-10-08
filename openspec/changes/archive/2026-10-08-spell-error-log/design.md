# Design

## Context

For motivation, see proposal.md.

- **Flagging:** `src/composer/attach.ts` `recheck()` computes `flagged`, the tokens the engine marks misspelled, and draws their underlines.
- **Events today:** `emit()` reports `autocorrect`, `revert`, `accept` and `ignore` (`AssistEvent`). The demo forwards them to the telemetry client, which posts them to `/v1/events`.
- **Server:** `server/assist/telemetry.py` `sanitize()` allowlists fields per event kind, and `spelling_by_lang()` already classifies pairs for `/summary`.

**Tiers:**
- **Tier 1** (the layer in the browser) emits the events. It needs no network itself: the host forwards events.
- **Tier 2** (the server) stores events and builds the report.

There's no interaction with undo, the editable DOM or RTL. Events are callbacks, and the underlines are unchanged.

## Decisions

### 1. When a `flag` is emitted
In `recheck()`, after `flagged` is computed, each flagged token whose `keyOf(t)` (`lang:text`) isn't in a per-message `reported` set is emitted as a `flag` and added to the set.
- **Message boundary:** `reported` is cleared when the composer's text becomes empty, the same condition that already resets `held`. That's when the message is sent or cleared.
- **Why key by word, not position:** typing earlier in the message shifts offsets, which would re-report the same word. "Once per word per message" is stable, and it's what the report counts.
- **Ignored and pending words** aren't flagged, so they're never reported as flags. An `ignore` is still reported by the popover.
- **Auto-replaced words** are fixed before they're ever underlined, so their `autocorrect` event is their record.

### 1b. Words left misspelled
`recheck()` already sees the composer empty after a send or clear (it resets `held` then). At that point, `flagged` still holds the words underlined in the previous check. Each of those not yet reported as `unresolved` in this message is emitted once, before `flagged`, `reported` and the per-message state are reset. Popover fixes, ignores and auto-corrections have already removed a word from `flagged`, and so has typing it correctly, so only words left misspelled remain.

A cleared composer counts the same as a sent message: the layer has no send hook, and a word left misspelled up to that point is still evidence for the dictionaries.

### 2. `rank` and `offered`
`showSuggestions()` knows the list it opened, so `accept(token, suggestion)` gets the index and the length. `AssistEvent` gains optional `rank` and `offered`.

### 3. Server allowlist
- `flag` and `unresolved` join `SPELLING` (fields: original).
- The spelling kind's extra fields gain `rank` and `offered` (numbers, already validated as finite).
- `spelling_by_lang()` ignores `flag` for its existing rates, so `/summary`'s current figures don't change.

### 4. The report (`server/assist/spelling_report.py`)
- **Logic:** a pure function `spelling_report(events, min_sessions)` returns per-language word tables and the three candidate lists, following the spec's rules (20%, 80%, 30%). The error type of each misspellings candidate comes from `error_types.classify`.
- **CLI:** `npm run telemetry:spelling` runs `uv run --project server --locked python -m assist.spelling_report [--min-sessions N]` and writes `telemetry/spelling-report.md` and `.json`.
- **`/summary`:** gains a "Dictionary candidates" section using the same function, with the top 20 of each list and a "needs human review" note.
- **Sessions** are counted by the event's `session` field. Events without one count as one session together.

## Risks / Trade-offs

- **Names in the log:** a customer's name the agent types gets flagged and stored. This is the same exposure as `ignore` today. The log is local and gitignored; for a pilot with real data, retention needs a decision (noted in docs).
- **Volume:** one event per distinct error word per message, plus at most one `unresolved` per word left in a sent message: small next to typing.
- **The last check can lag the send by up to the debounce (150 ms):** a word underlined or fixed in that window may be missed or counted. That's negligible for candidate mining, where thresholds need several sessions.
- **Thresholds** are guesses. They're CLI options or constants and can be tuned once real data exists.
