# Design

## Context

For motivation and the experiment's numbers, see proposal.md.

Everything here is **Tier 2** (`server/assist/`). The browser client, the ghost text, undo and the RTL layout don't change: the reply keeps `completion` and `edit` with the same meaning, so no interaction with the editable DOM changes.

Today's path:

```
CompleteSentence → { word, rest } → postprocess.assemble (extends-typed and whole-word checks) → finalize → reply
```

The new path:

```
ContinueText → { continuation } → postprocess.join (echo drop, seam spacing) → finalize (unchanged) → edit derived → reply
```

The experiment's signature and assembly are in the session scratchpad (`contracts.py`); this change moves them into the server.

## Goals / Non-Goals

**Goals:**
- The agent's text goes to the model as is, and one string comes back that starts exactly where the agent's text stops.
- The server only does what is never ambiguous: spacing after a space or punctuation, and dropping a rewritten unfinished word. It never decides a word boundary the model should have decided.
- The same reply shape, so no client change.

**Non-goals:**
- Verifying the seam word (a later change could use the browser's Hunspell).
- Prompt optimization, and a committed eval.

## Decisions

### 1. One output field, rules by case in the instructions

```python
class ContinueText(dspy.Signature):
    """You continue the text a contact-center agent is typing to a customer.
    `continuation` is appended to `agent_text` exactly as you write it, with nothing added in between, so it must start exactly where `agent_text` stops:
    - `agent_text` ends in the middle of a word: start with the missing letters of that word, with no space. "Your request is being proce" → "ssed today." and "تم استلا" → "م طلبك."
    - `agent_text` ends with a complete word: start with a space, or with punctuation that belongs right after the word. "Your request" → " has been received." and "تم استلام طلبك" → " وسيتم معالجته قريباً."
    - `agent_text` ends with a space: start directly with the next word, with no space. "Your request " → "has been received." and "تم استلام " → "طلبك."
    - `agent_text` ends with punctuation: start with a space, then the next word. "Thank you," → " we have received your request." and "شكراً لك،" → " تم استلام طلبك."
    Never repeat any part of `agent_text`.
    … (language, one sentence, sources and details rules unchanged)
    Return an empty `continuation` only when no continuation fits the conversation at all."""
    approved_responses: list[str] = dspy.InputField(...)
    knowledge_base: list[str] = dspy.InputField(...)
    conversation: list[Turn] = dspy.InputField(...)
    agent_text: str = dspy.InputField(desc="What the agent has typed so far, up to the caret, exactly as typed.")
    continuation: str = dspy.OutputField(desc="The text that goes right after agent_text, starting exactly where it stops.")
```

- **Name:** the program keeps the name `CompletionProgram`; the signature is renamed `ContinueText`.
- **Example sentences:** the instructions' examples are generic, not the canned responses, so they don't steer wording.
- **Unchanged:** the input fields and their order, the typed JSON adapter and its parse (lenient form, strict type), the no-retry rule.

**Alternatives considered:**
- **The completed sentence** (`sentence`, the server strips the typed part): the most robust seam, but 10–20 more output tokens, and the model may reword earlier text. Kept in reserve if the continuation's seam errors grow.
- **Repair rules on `word`/`rest`:** these keep an awkward contract and add heuristics. Rejected after the experiment.

### 2. Assembly: `join(prefix, continuation)`, then the existing `finalize`

In `postprocess.py`, `assemble` and `Structured` are replaced by:

```
join(prefix, continuation):
  out = first line of continuation
  typed = trailing letters/digits/marks of prefix
  if typed and out starts (case-insensitively) with typed followed by ≥1 letter/digit/mark:
      out = out[len(typed):]          # the model wrote the word again from its start
  if prefix ends with whitespace:     out = out.lstrip()
  elif not typed and out starts with a letter/digit: out = " " + out   # after punctuation
  return finalize(prefix, out)
```

`finalize` is unchanged:
- restated-tail removal, skipped when the continuation joins a word;
- one sentence, 20 words, the script check, identifiers kept whole.

The echo drop runs before the spacing rules, so "proce" + "Processed yet." becomes "ssed yet.", keeping the agent's letters.

**`edit` derivation** (`derive_edit(prefix, completion)`):
- `typed` is the trailing run of the prefix;
- if `typed` is non-empty and the completion starts with a letter, digit or mark, `lead` is that leading run, `word = typed + lead` and `rest = completion[len(lead):]`;
- otherwise `word = typed` and `rest = completion`;
- `completion == word[len(typed):] + rest` holds by construction, and a test asserts it.

**Withheld:** only `format`, raised by the adapter's parse (no JSON object, or `continuation` missing or not a string). An empty `continuation`, or one that `finalize` empties, is an empty completion without `withheld`.

### 3. The offline test model

`fake_completion(agent_text, source)` keeps its choices and returns the continuation:
- with a typed word that matches: `word[len(typed):] + rest`;
- with a typed word that doesn't match: `" " + source`;
- without a typed word: `rest`, stripped after a space.

The canned tester scenarios (T4.2, T4.7, T4.14, T4.17) therefore produce the same completions as today.

### 4. Tuning "after punctuation" before archiving

In the experiment, shown after punctuation fell from 90% to 70%. The model answered empty more often. One instruction revision is planned:
- reword the punctuation rule to say the next words are expected;
- move "Return an empty `continuation` only when…" after the case rules.

Then the comparison is rerun: 60 cases × 5 samples, cache off, the scratchpad script ported to the new server code.

**Acceptance:**
- shown is at least the `word`/`rest` figure measured the same day;
- after-punctuation shown is at least 80%;
- seam correct is at least 97%;
- spacing errors are 0%.

The numbers go in `live-check.md` in the change. If after-punctuation stays under 80%, the change still lands if the overall acceptance holds, and the gap is noted for the optimizer change.

**Outcome:** after one tuning round, the shown and spacing targets were met. After punctuation came in at 75% and seam correctness at 96.5%; the user accepted both as is, so those two targets are relaxed to the measured values. The remaining seam errors are Arabic letters repeated at the join (KI-6). The numbers are in `live-check.md`.

### 5. Known issue: the seam is not checked

Add a known-issue entry to `docs/known-issues.md`:
- a mid-word join can double or drop a letter (observed: "التفا" + "اصيل");
- the server shows it as written;
- mitigation options: a browser-side Hunspell check of the completed word before showing it, or the completed-sentence contract.

`docs/TESTING.md` T4.17 changes from "nothing is shown, counted as format" to "the model's join is shown as written; report any misspelled join".

## Risks / Trade-offs

- **Undetected bad joins** reach the agent (about 2% of shown samples in the experiment, all in one Arabic case). → Known issue, a tester scenario, and the dataset `seamWord` check in the live comparison.
- **The echo drop misreads a real word that starts with the typed letters:** typed "on" + "one of them" was meant as "on one of them" but becomes "one of them". → This is rare: it needs the model to also drop the space it was told to write. The instructions' "complete word" rule reduces it, and tests pin the behavior.
- **Model drift between runs:** the experiment used 5 samples. → The rerun after tuning uses the same sampling, and both contracts are measured the same day.
- **Telemetry history:** `format` counts drop sharply after this change, and old logs mix both meanings. → Noted in the summary page's existing wording ("model output the server couldn't use"), which still holds.

## Migration Plan

1. Change the signature, the fake, `join` and `derive_edit`, and the endpoint `build`, with tests.
2. Update the scenario suite. The coverage check forces every new or renamed English scenario to have a test.
3. Tune the instructions and run the live comparison.
4. Update the docs.

**Rollback:** revert the commits. The reply shape didn't change, so nothing else needs migrating.
