# Evaluation data: provenance and licensing

`MANIFEST.json` lists every data file with its source, license and sha256. `npm run eval` refuses any file that's unlisted or changed, and `npm run eval:manifest` shows what changed (`--write` records it). Private data goes in the gitignored `private/` directory under its own `MANIFEST.json`, and reports show only aggregates for it.

## Committed data

All committed data is **synthetic and written for this prototype**. It is not real GOSI content, policies, figures or people.

| File | Kind | How it's made |
|---|---|---|
| `clean-en/ar/mixed.jsonl` | clean | From `src/*.txt` (hand-marked) by `npm run eval:build`. Includes the synthetic texts of `server/data/canned.json` and `kb.json` |
| `typos-en/ar.jsonl` | typos | From `src/typos-*.txt`. Seeded from `test/autocorrect/corpus.test.ts`, minus the entries the engine accepts as words |
| `injected-en/ar.jsonl` | injected | `npm run eval:inject` over the clean sets, with the seeds and commands recorded in `MANIFEST.json` |
| `words-en/ar.tsv` | wordlist | `npm run eval:words` over the clean sets |
| `custom-words.txt` | custom dictionary | The admin terms the datasets are evaluated with |

**Review status:** Claude drafted the clean and typo messages. A person still has to check that they're correct, natural agent language before the numbers are trusted. The `source` field of each entry says "human review: pending" until then.

## Public sources: license review (October 3, 2026)

**Verdicts:**
- **commit**: may be added to the repository as evaluation-only data. It is never shipped, and keeps its attribution.
- **local-only**: may be used through `private/` by someone who accepts its terms; it is never committed.
- **reject**: not to be used.

Share-alike terms (CC BY-SA) apply only to the derived data file itself. No public data is in the repository yet; each import is its own follow-up task.

| Source | Content | License found | Verdict |
|---|---|---|---|
| [Wikipedia: Lists of common misspellings](https://en.wikipedia.org/wiki/Wikipedia:Lists_of_common_misspellings) | English misspelling → correction pairs | CC BY-SA 4.0 (Wikipedia text) | **commit**, with attribution, as a CC BY-SA data file; confirm with legal first |
| [Birkbeck spelling error corpus](https://titan.dcs.bbk.ac.uk/~roger/), Oxford Text Archive item 0643 | English misspellings by children, adult learners and L2 writers | Terms not confirmed (the archive page was not reachable) | **local-only** until its terms are confirmed |
| [GitHub Typo Corpus](https://github.com/mhagiwara/github-typo-corpus) | Multilingual typo edits from GitHub commits | No dataset license; "the copyright and license terms of the individual commits and texts follow the terms of the repositories they belong to" | **reject** for commit (mixed, unknown terms); **local-only** at most |
| [QALB](https://camel.abudhabi.nyu.edu/qalb-shared-task-2015) (shared task 2015 release) | Corrected Arabic comments and L2 essays | Download requires accepting two license agreements (research use) | **local-only**, under the agreement |
| [ZAEBUC](https://aclanthology.org/2022.lrec-1.9) | Arabic and English learner essays with spelling corrections | CC BY-NC 4.0 (ELRA) | **reject**: non-commercial terms don't fit commercial product work |
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) | Word frequency lists (EN, AR and others) from OpenSubtitles | CC BY-SA 4.0 (content), MIT (code) | **commit**, with attribution, as a CC BY-SA word list; confirm with legal first |
