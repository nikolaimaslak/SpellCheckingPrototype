# Design

## Context

- **The completion path:**
  - `server/complete.ts` `complete(input, deps)` retrieves sources from `deps.library`/`deps.kb`, builds the system and user prompt, and calls `deps.model.complete(system, user, signal, { responseSchema })`. It then parses, assembles and finalizes, and returns `{ completion, edit?, withheld?, lang, latencyMs, model, sources }`.
  - `deps.model` is any `CompletionModel` (`server/types.ts`). `server/model-select.ts` `selectModel(env)` picks Gemini or the fake model, the same way the server does. `server/main.ts` loads `server/data/canned.json` and `kb.json` (through `kbPassages`).
- **The spelling eval** (`eval/`) has the pattern this change follows:
  - committed datasets with a manifest;
  - `criteria.json` and `baseline.json`;
  - `--check` and `--baseline`;
  - reports in the gitignored `eval/reports/`.

  Its modules are spelling-specific (`Metrics`, `Baseline`), and run through `eval/register.ts` because `src/` has extensionless imports.
- **`server/` uses `.ts` import extensions,** so a module that only imports `server/` runs under plain Node, and under Vitest.
- **`scripts/measure-completion.ts`** has the seam judge (`wordAt`, `judge`), one sample per case over HTTP.

## Goals / Non-Goals

**Goals:**
- **Determinism where possible:** real model answers are frozen and replayed in `npm test`.
- **Honest statistics where not:** repeated samples, tolerances above run-to-run noise, and stability measured as a metric of its own.
- **Any model:** the same dataset, benchmark and gate for Gemini today and the local LLM later.
- **Nothing in `server/` changes.**

**Non-Goals:**
- Browser end-to-end tests, LLM-as-judge, GOSI-domain cases, and detecting invented names.

## Decisions

### D1. Layout (Tier 2 tooling, config)

`eval/completion/`, all plain Node with `.ts` imports, and no `src/` imports:
- **`cases.jsonl`:** the dataset; plus `cases.ts`, the loader and validation, with the dataset hash.
- **`recording.ts`:**
  - `recordKey(model, system, user, opts)`, a SHA-256 of a canonical JSON;
  - `createRecorder(model)`: wraps a live model and captures `{ key, raw }`;
  - `createReplayModel(records, name)`: answers by key, or throws `NoRecording` with the key.
- **`run.ts`:**
  - `runCase(case, model)` calls `complete()` with the library and KB loaded as in `main.ts`;
  - it wraps the model so it sees the user prompt, which is the context the invention check needs;
  - it returns `{ reply, raw, user, ms }`.
- **`judge.ts`:** seam word, spacing, the invariants, and invented details. Pure functions, ported from `measure-completion.ts` and extended.
- **`metrics.ts`, `criteria.ts`, `gate.ts`, `report.ts`:** the completion versions of the spelling eval modules.
- **`criteria.json`, `baseline.json`, and `recordings/<model>.jsonl`.**

The CLI is `eval/cli/completion.ts`, with these npm scripts:
- `eval:completion` (run plus report);
- `:check`;
- `:baseline`;
- `:record`.

They're all run as `node eval/cli/completion.ts …`. The CLI loads `.env` with the same minimal loader as `server/main.ts` (`KEY=value` lines; real environment variables win), so the key stays in `.env` and is never printed.

*Alternative rejected:* generalizing the spelling eval's metrics and gate. Their shapes are spelling-specific (outcomes per word, error types), and a shared abstraction would cost more than about 150 lines of completion-specific code.

### D2. Recording key and content

- **The key:** `sha256(JSON.stringify({ model: name, system, user, opts }))`. It covers:
  - the instructions;
  - the retrieved sources and the transcript (both in `user`);
  - the schema.

  So any change that alters what the model sees invalidates the recording. That's what makes a stale recording impossible.
- **A recording line:** `{ case, key, raw, reply: { completion, edit, withheld } }`. `latencyMs` isn't stored, because it varies.
- **The replay model** takes its `name` from the file. Replies then carry the recorded model's name, and the key check is consistent.
- **Recordings** are written only by `--record`, from sample 1 of each case. That replaces the whole file, so deleted cases don't linger.

### D3. Judging

- **Seam word:** the word of `prefix + completion` that spans the prefix's last character, compared lower-case and without Arabic diacritics or tatweel. It's applied only when the case has a `seamWord` and a completion is shown.
- **Spacing error:**
  - the prefix ends in whitespace and the completion starts with whitespace; or
  - the prefix ends in punctuation (not whitespace) and the completion starts with a letter or digit.

  Mid-word joins aren't spacing errors; the seam check judges those.
- **Invariants (replay only):**
  - the seam word;
  - no spacing error;
  - `completion === edit.word.slice(edit.typed.length) + edit.rest` when shown;
  - at most one sentence terminator followed by a space or the end;
  - the script of the first non-identifier word matches the prefix's script.

  These duplicate `finalize`'s guarantees on purpose: they catch a regression in it.
- **Invention:** digit runs (Arabic-Indic digits mapped to Western), emails and links extracted from the completion. Each must occur in the context, meaning the prefix plus the full user prompt the model received (which contains the transcript and the sources sent). Any `mustNotInvent` string present in the completion but absent from the context also counts. Names aren't checked.

### D4. Statistics and the gate

- **Sample size:** 60 cases × 5 samples gives about 300 samples. A rate's run-to-run spread is then a few points overall, and more per language or category. Samples of one case are correlated (temperature 0.2), so case-level effects dominate.
- **Initial criteria** (provisional, like the spelling eval's), all on `all` unless noted:

  | Criterion | Threshold | Tolerance |
  |---|---|---|
  | `seam-accuracy` | ≥ 0.90 | 0.05 |
  | `spacing-errors` | ≤ 0.02 | 0.02 |
  | `inventions` | ≤ 0.02 | 0.02 |
  | `format-rate` | ≤ 0.15 | 0.06 |
  | `shown-rate` | ≥ 0.70 | 0.06 |
  | `seam-accuracy-ar` | ≥ 0.85 | 0.10 |
  | `shown-agreement` | ≥ 0.70 | threshold only |
  | `latency-p95` | ≤ 1500 ms | threshold only |

- **How `--check` judges them:**
  - compared criteria fail only on a regression beyond their tolerance against the baseline (the threshold verdict is reported, not gating);
  - threshold-only criteria fail on their threshold.

  That way a known weakness, like today's `format` rate, doesn't block every run, but a worsening does.
- **Tolerances are validated empirically** (task 4.2): two runs on unchanged code must pass against each other. If they don't, the tolerances widen, or the samples increase, and the result is noted.
- **The baseline** stores the model name, the dataset hash and the sample count. A mismatch means `--check` refuses.

### D5. Dataset

About 60 cases, written by hand, all made-up:

| Group | Cases |
|---|---|
| English | 32 |
| Arabic | 18 |
| Mixed Arabic/English | 10 |

- **Categories** (spread across the languages):
  - mid-word, about 20, each with an unambiguous `seamWord`;
  - finished-word, about 12;
  - after punctuation, about 8 (comma, colon, a closing quote);
  - after a space, about 6;
  - new sentence after ". ", about 6;
  - details, about 8 (a conversation with an email, an order number or a date; `mustNotInvent` set for figures the model might change).
- **Topics:** everyday and technical chat (support for a generic online shop, travel, a software bug, the testers' Leibniz and RL chats), never GOSI policy.
- **Sources:** the canned and KB sources stay enabled as in the demo. The off-domain text rarely retrieves them, which is realistic, and the retrieval is part of the key.

### D6. What the replay test does and doesn't prove

- **It proves:** for these frozen real answers, today's pipeline gives the recorded replies and keeps the invariants. It is deterministic and offline, and it's part of `npm test`.
- **It doesn't prove:** that the model still answers that way. That's the live benchmark's job.
- **When the replay suite fails after a prompt change:** re-record, review the diff of the recordings file (the new replies are visible), run `--check`, and commit both.

### D7. Assembly fixes found by the first recordings (Tier 2)

The first Gemini recording (60 cases) failed four replay invariants. Each was a defect the agent would have seen:

| Case | Model answer | Shown |
|---|---|---|
| "…technical depa" | `word: "department"`, `rest: "rtment for assistance."` | "rtmentrtment…" |
| "…لك التفا" | `word: "التفا"`, `rest: "اصيل…"` | "التفااصيل" |
| "…يمكنني مسا" | `word: "مساعدة"`, `rest: "ك اليوم؟"` (5 of 5 samples) | "مساعدةك" |
| "…جديد. " | `word: ""`, `rest: " وسيتواصل…"` | a double space |

In `assemble` (`server/postprocess.ts`):
- **The word is whole:** if `word` is non-empty and `rest` starts with `[\p{L}\p{N}\p{M}]`, return `'format'`. The contract already says `word` is the whole word and `rest` starts "with a space or punctuation as needed"; this enforces it. A broken word becomes no suggestion.
- **No double space:** without a typed part, if the prefix ends in whitespace, trim the completion's leading whitespace before building the edit, so the edit (`rest`) matches what's shown.

*Alternative rejected:* repairing the answers, by dropping a duplicated tail or merging an Arabic suffix (ة→ت). Repairs are guesses; withholding is deterministic. The "مسا" case shows nothing until the prompt says attached pronouns belong in `word`, which is left for the typed-word-hint change.

## Undo, editable DOM, RTL

This is test tooling only, with no client change. Arabic and mixed cases go through the same judges, comparing without diacritics.

## Risks / Trade-offs

- **Recordings depend on the model version.** Gemini may change behind the same name. → The live benchmark catches the drift. Recordings are only re-made on purpose.
- **Cost and time:** about 300 Gemini calls per run, about 1–2 minutes at concurrency 4. → The run is manual or scheduled, never in `npm test`.
- **Hand-written expectations can be wrong** (an ambiguous `seamWord`). → Each mid-word case must have exactly one plausible completion. The report lists the worst cases, so a bad case shows up and can be fixed.
- **The invention check is narrow** (digits, emails, links). → It's documented; names are left for a later check.
