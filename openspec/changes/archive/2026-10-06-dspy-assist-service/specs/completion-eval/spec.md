## REMOVED Requirements

### Requirement: Recorded replays
**Reason**: The replays run each case through the previous server in-process, and their recordings are keyed by a hash of that server's prompt text. A typed program renders its prompt differently, so no recording can match. The completion eval will be redesigned, in Python, in its own change.
**Migration**: Until then, the Python service's behavior is covered by its pytest suite, which repeats the previous server's tests with fixed model answers, offline. Before removal, one live run of the benchmark on the previous server is committed as a reference report (`eval/completion/reference/node-server.md`), and the new eval must be compared with it.

### Requirement: Live benchmark run
**Reason**: The runner imports the previous server's completion pipeline in-process, and that pipeline is removed. The redesigned eval belongs to a separate change.
**Migration**: Run the reference report's cases by hand against `/v1/complete` if a live check is needed before the new eval exists. `npm run eval:completion*` scripts are removed.

### Requirement: Completion metrics
**Reason**: Removed with the live benchmark it measures. The redesigned eval will define its own metrics.
**Migration**: The last values are kept in the reference report.

### Requirement: Completion criteria and gate
**Reason**: Removed with the live benchmark. `eval/completion/criteria.json` and `baseline.json` describe the previous server and model setup.
**Migration**: The last baseline values are kept in the reference report. There is no completion quality gate until the redesigned eval lands. CLAUDE.md says so.

### Requirement: Completion report
**Reason**: Removed with the live benchmark.
**Migration**: `eval/completion/reference/node-server.md` is the last report.
