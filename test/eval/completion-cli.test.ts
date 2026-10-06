import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadCases } from '../../eval/completion/cases';
import { createReplayModel, readRecordings } from '../../eval/completion/recording';
import { loadServerData, runCase } from '../../eval/completion/run';

const dir = mkdtempSync(join(tmpdir(), 'completion-eval-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const cli = (args: string[], env: Record<string, string>) =>
  spawnSync(process.execPath, ['eval/cli/completion.ts', ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

describe('eval:completion CLI', () => {
  it('runs with the offline model, writes a report, and records replayable answers', async () => {
    const r = cli(['--allow-fake', '--samples', '1', '--record', '--reports-dir', dir, '--recordings-dir', dir, '--baseline-file', join(dir, 'baseline.json')], { COMPLETION_MODEL: 'fake' });
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(dir, 'completion-latest.md'))).toBe(true);
    expect(readFileSync(join(dir, 'completion-latest.md'), 'utf8')).toMatch(/^# Completion benchmark/);

    const recordings = readRecordings('fake', dir);
    const { cases } = loadCases();
    expect(recordings.map((x) => x.case)).toEqual(cases.map((c) => c.id));
    const replay = createReplayModel('fake', recordings);
    const data = loadServerData();
    for (const c of cases) expect((await runCase(c, replay, data)).reply, c.id).toEqual(recordings.find((x) => x.case === c.id)!.reply);
  }, 60_000);

  it('passes --check against a baseline from the same deterministic model', () => {
    const base = join(dir, 'baseline.json');
    expect(cli(['--allow-fake', '--samples', '1', '--baseline', '--reports-dir', dir, '--baseline-file', base], { COMPLETION_MODEL: 'fake' }).status).toBe(0);
    const r = cli(['--allow-fake', '--samples', '1', '--check', '--reports-dir', dir, '--baseline-file', base], { COMPLETION_MODEL: 'fake' });
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain('gate: pass');
  }, 60_000);

  it('refuses to run without a live model unless --allow-fake is given', () => {
    const r = cli(['--samples', '1', '--reports-dir', dir], { COMPLETION_MODEL: 'auto', GEMINI_API_KEY: '' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/needs a live model/);
  });
});
