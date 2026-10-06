// Recorded replays (openspec/specs/completion-eval): every case's real model
// answer, replayed offline through the real completion service. Deterministic:
// a failure means the pipeline or the prompt changed, never model noise.
import { describe, expect, it } from 'vitest';
import { loadCases } from '../../eval/completion/cases';
import { invariants } from '../../eval/completion/judge';
import { createReplayModel, NoRecording, readRecordings, recordedModels } from '../../eval/completion/recording';
import { loadServerData, runCase } from '../../eval/completion/run';

const RERECORD = 'npm run eval:completion:record';
const { cases } = loadCases();
const data = loadServerData();
const models = recordedModels();

it('has recordings for at least one model', () => {
  expect(models, `no recordings in eval/completion/recordings/: run ${RERECORD}`).not.toEqual([]);
});

describe.each(models)('replay: %s', (model) => {
  const recordings = readRecordings(model);
  const byCase = new Map(recordings.map((r) => [r.case, r]));
  const replay = createReplayModel(model, recordings);

  it.each(cases.map((c) => [c.id, c] as const))('%s', async (id, c) => {
    const recorded = byCase.get(id);
    expect(recorded, `case "${id}" has no recording for ${model}: run ${RERECORD}`).toBeDefined();
    let run;
    try {
      run = await runCase(c, replay, data);
    } catch (err) {
      if (err instanceof NoRecording) throw new Error(`case "${id}": the prompt changed since it was recorded for ${model}; run ${RERECORD}`);
      throw err;
    }
    expect(run.reply, `case "${id}": the request failed (${run.error})`).not.toBeNull();
    expect(run.reply, `case "${id}": the reply differs from the recorded one`).toEqual(recorded!.reply);
    expect(invariants(c, run.reply!), `case "${id}"`).toEqual([]);
  });
});
