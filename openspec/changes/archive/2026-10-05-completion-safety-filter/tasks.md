# Tasks

## 1. The filter

- [x] 1.1 Create `server/safety.ts` with `safetyCheck(completion, ctx)` and `verbatimIn(completion, texts)` (design D1), with the English and Arabic word sets inline and the email and URL patterns copied from `src/tokenizer/exclusions.ts` (with a pointer comment). Verify with `test/server/safety.test.ts`, which covers every scenario of the delta's "Output post-processing":
  - figure: digits, Arabic-Indic digits, "three", "ثلاثة", "بثلاثة", "SAR", "%";
  - date: "Monday", "January", "next week", "within a few days", "رمضان", "الأحد", "خلال أسبوع", "الشهر القادم";
  - identifier: email, `www.` link;
  - conversation: "Noura" and "نوره" from customer turns; "request" passes because it's in the library; words only in agent turns don't count;
  - false-positive guards: "someone", "no one", "May I help", "march" (lowercase), "have a nice day", "اليوم";
  - `allowSourcedFigures`: a verbatim sourced figure passes, a paraphrase is still blocked, and an identifier is still blocked;
  - the reason order: identifier before conversation before figure before date.
- [x] 1.2 Verify the filter against the shipped data. A test runs every canned response and KB passage through `safetyCheck` as if it were a completion, and records which are withheld under `block`, so the demo impact is known. All the ones containing digits or number words should be withheld. A test also checks that `verbatimIn` accepts each one under `allow`.

## 2. Service wiring

- [x] 2.1 Wire the filter into `server/complete.ts` (design D2: vocabulary cache, `allowSourcedFigures`, `withheld` in the reply, `onWithheld`), and add `withheld?` to `CompleteReply` in `server/types.ts`. Verify with `test/server/complete.test.ts`:
  - the fake model's "…within 3 working days" reply is withheld under the default with `withheld: "figure"`, and returned under `allowSourcedFigures: true`;
  - a clean reply passes with no `withheld`;
  - `onWithheld` receives the reason and language, and never any text.
- [x] 2.2 Make the prompt depend on the setting (design D3) in `server/prompt.ts`. Verify with `test/server/prompt.test.ts`: the `block` instruction forbids numbers, dates, periods, reference numbers, emails, links and names; the `allow` instruction limits figures to verbatim approved text; both still forbid identifiers and names.
- [x] 2.3 In `server/main.ts`: read `COMPLETION_SOURCED_FIGURES` (`allow`, otherwise `block`), pass it to `complete` and the prompt, wire `onWithheld` to append a `completion-withheld` event, and add `sourcedFigures` to `/health`. Verify with a test for the setting parser, and a `/health` check where the server is testable (or, if `main.ts` has no test seam, extract the parsing into a small exported function and test that).

## 3. Telemetry

- [x] 3.1 In `server/telemetry.ts`: add `completion-withheld` to the completion events, allowlist `reason` only for the four values, count withheld events by reason in `summarize`, and show them in `renderSummary`. Verify with `test/server/telemetry.test.ts`:
  - `sanitize` keeps `reason: "figure"`, and drops `reason: "secret text"` and any `completion` field;
  - the spec scenario (10 shown, 3 withheld for `figure`, 1 for `conversation`) renders those counts.

## 4. Docs

- [x] 4.1 Document `COMPLETION_SOURCED_FIGURES` in `.env.example`, `README.md` (the server row) and `CLAUDE.md` (the `npm run server` row). Verify that all three name the same values and default.
- [x] 4.2 Update `docs/TESTING.md`:
  - T4.2's expectation: with the default setting, the "3 working days" canned suggestion is withheld, so type a prefix whose suggestion has no figures, chosen from the canned data in 1.2;
  - a new scenario: set `COMPLETION_SOURCED_FIGURES=allow`, restart, and the figure suggestion appears;
  - a summary scenario: T8 shows withheld counts;
  - a known-limitation line: suggestions with numbers, dates or names are withheld (Req 3.7).

  Verify every changed scenario against the offline model with a server test that replays it.
- [x] 4.3 Update `docs/requirements/gap-analysis-60145-60254.md` (Req 3.7 → Met, with the sourced-figures switch pending SV question 3) and add the change to the "Done" list. Verify that the row and the list are consistent.

## 5. Integration

- [x] 5.1 Manual check (done October 5, 2026, `COMPLETION_MODEL=fake` on port 5185, local telemetry log backed up and restored):
  - `block`: `/health` → `"sourcedFigures":"block"`; the T4.14 prefix → `{"completion":"","withheld":"figure",…}`; the T4.2 prefix → `" are up to date, and the latest payment has been registered on your account."`; the log gained only `{"type":"completion-withheld","lang":"en","reason":"figure","ts":…}`; `/summary` → "Completions withheld (Req 3.7) 1: figure 1 · date 0 · identifier 0 · conversation 0 · next to 11 shown".
  - `allow`: `/health` → `"sourcedFigures":"allow"`; the T4.14 prefix → `" has been received and will be processed within 3 working days; …"`.
- [x] 5.2 Run `npm run typecheck`, `npm test` and `npm run build`. Verify that all pass.
- [x] 5.3 Run `openspec validate completion-safety-filter --strict`. Verify that it passes.
