import { describe, expect, it } from 'vitest';
import type { CompletionCase } from '../../eval/completion/cases';
import { createReplayModel, NoRecording, recordKey } from '../../eval/completion/recording';
import { loadServerData, runCase } from '../../eval/completion/run';
import { createFakeModel } from '../../server/models/fake';
import { COMPLETION_SCHEMA } from '../../server/prompt';

const data = loadServerData();
const kase: CompletionCase = { id: 'c1', lang: 'en', category: 'finished-word', prefix: 'Thank you for contacting us, your request', seamWord: 'request', transcript: [{ role: 'customer', text: 'When will my request be processed?' }] };

describe('recordKey', () => {
  it('is stable for equal inputs and changes with any of them', () => {
    const k = recordKey('m', 'sys', 'user', { responseSchema: COMPLETION_SCHEMA });
    expect(recordKey('m', 'sys', 'user', { responseSchema: COMPLETION_SCHEMA })).toBe(k);
    expect(recordKey('m', 'sys!', 'user', { responseSchema: COMPLETION_SCHEMA })).not.toBe(k);
    expect(recordKey('m', 'sys', 'user!', { responseSchema: COMPLETION_SCHEMA })).not.toBe(k);
    expect(recordKey('m', 'sys', 'user', {})).not.toBe(k);
    expect(recordKey('n', 'sys', 'user', { responseSchema: COMPLETION_SCHEMA })).not.toBe(k);
  });
});

describe('replay model', () => {
  it('answers from recordings and throws NoRecording otherwise', async () => {
    const live = await runCase(kase, createFakeModel(), data);
    const replay = createReplayModel('fake', [{ case: 'c1', key: live.key!, raw: live.raw!, reply: live.reply! }]);
    expect((await runCase(kase, replay, data)).reply).toEqual(live.reply);
    await expect(runCase({ ...kase, prefix: 'Something else entirely' }, replay, data)).rejects.toBeInstanceOf(NoRecording);
  });
});

describe('runCase', () => {
  it('returns the reply, the raw answer and the user prompt the model saw', async () => {
    const run = await runCase(kase, createFakeModel(), data);
    expect(run.reply?.completion).toMatch(/^ has been received/);
    expect(run.reply?.edit).toMatchObject({ typed: 'request', word: 'request' });
    expect(JSON.parse(run.raw!)).toMatchObject({ word: 'request' });
    expect(run.user).toContain('When will my request be processed?');
    expect(run.user).toContain('Agent is typing:\nThank you for contacting us, your request');
    expect(run.ms).toBeGreaterThanOrEqual(0);
  });

  it('counts a failing model as an error, not a crash', async () => {
    const run = await runCase(kase, { name: 'x', complete: async () => { throw new Error('boom'); } }, data);
    expect(run.reply).toBeNull();
    expect(run.error).toMatch(/failed/);
  });
});
