# tokenizer

**Tokenizer and exclusion rules** (architecture §3) — tier 1, browser, no network.

Emits settled words only (after a boundary character), excludes URLs, emails, case/reference numbers, tokens with digits and Bright Pattern substitution fields such as `$(user.firstName)`, and routes each token to Arabic or English by script detection. Empty until Phase 1.
