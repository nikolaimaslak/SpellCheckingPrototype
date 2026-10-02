# composer

**Composer integration layer** (architecture §3) — tier 1, browser.

The single hook into the chat and email editors shared by all services: observes text changes on a debounce, keeps the token-to-range map, draws misspelling underlines via the CSS Custom Highlight API and completion ghost text in a decoration layer (never inside the editable DOM), and applies accepted suggestions / auto-replacements through one transaction path so a single undo reverts them. Empty until Phase 1.
