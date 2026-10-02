import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256, verifyAndPlace } from '../../scripts/fetch-dicts';

describe('verifyAndPlace', () => {
  const genuine = new TextEncoder().encode('SET UTF-8\n');

  it('places a file whose hash matches', () => {
    const dest = join(mkdtempSync(join(tmpdir(), 'dicts-')), 'ar', 'ar.aff');
    verifyAndPlace('ar.aff', genuine, sha256(genuine), dest);
    expect(readFileSync(dest)).toEqual(Buffer.from(genuine));
  });

  it('rejects a tampered payload, names the file, and leaves nothing behind', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'dicts-')), 'ar');
    const tampered = new TextEncoder().encode('SET UTF-8\nevil\n');
    expect(() => verifyAndPlace('ar.dic', tampered, sha256(genuine), join(dir, 'ar.dic'))).toThrow(/ar\.dic: sha256 mismatch/);
    expect(existsSync(join(dir, 'ar.dic'))).toBe(false);
    expect(existsSync(join(dir, 'ar.dic.tmp'))).toBe(false);
  });
});
