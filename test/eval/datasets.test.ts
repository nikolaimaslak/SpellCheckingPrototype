import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ManifestError, loadAll, sha256, verify, type ManifestEntry } from '../../eval/datasets';

const DATA = '{"id":"1","text":"Thank you."}\n';
const entry = (file: string, data: string, extra: Partial<ManifestEntry> = {}): ManifestEntry => ({
  file,
  kind: 'clean',
  lang: 'en',
  source: 'test',
  license: 'test',
  sha256: sha256(data),
  ...extra,
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'datasets-'));
  writeFileSync(join(dir, 'a.jsonl'), DATA);
  writeFileSync(join(dir, 'MANIFEST.json'), JSON.stringify({ datasets: [entry('a.jsonl', DATA)] }));
  return dir;
}

describe('datasets and manifest', () => {
  it('loads listed datasets whose hashes match', () => {
    const { datasets } = loadAll(fixture());
    expect(datasets.map((d) => [d.name, d.messages.length])).toEqual([['a', 1]]);
  });

  it('refuses an unlisted file and names it', () => {
    const dir = fixture();
    writeFileSync(join(dir, 'b.jsonl'), DATA);
    expect(() => verify(dir)).toThrow(ManifestError);
    expect(() => verify(dir)).toThrow(/b\.jsonl/);
  });

  it('refuses a changed file and names it', () => {
    const dir = fixture();
    writeFileSync(join(dir, 'a.jsonl'), '{"id":"1","text":"Thank you!"}\n');
    expect(() => verify(dir)).toThrow(/hash mismatch for .*a\.jsonl/);
  });

  it('loads private datasets under their own manifest as kind private', () => {
    const dir = fixture();
    mkdirSync(join(dir, 'private'));
    writeFileSync(join(dir, 'private', 'pilot.jsonl'), DATA);
    expect(() => loadAll(dir)).toThrow(/pilot\.jsonl/); // unlisted, even in private/
    writeFileSync(join(dir, 'private', 'MANIFEST.json'), JSON.stringify({ datasets: [entry('pilot.jsonl', DATA)] }));
    expect(loadAll(dir).datasets.map((d) => [d.name, d.entry.kind])).toEqual([
      ['a', 'clean'],
      ['pilot', 'private'],
    ]);
  });

  it('reads the custom dictionary a dataset names', () => {
    const dir = fixture();
    writeFileSync(join(dir, 'custom.txt'), '# comment\nGOSI\nAbsher\n');
    writeFileSync(join(dir, 'MANIFEST.json'), JSON.stringify({ datasets: [entry('a.jsonl', DATA, { customWords: 'custom.txt' })] }));
    expect(loadAll(dir).datasets[0].customWords).toEqual(['GOSI', 'Absher']);
  });
});
