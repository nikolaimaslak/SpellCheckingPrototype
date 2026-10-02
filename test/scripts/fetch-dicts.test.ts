import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { provisionArabic, sha256, verifyAndPlace } from '../../scripts/fetch-dicts';

const tmp = () => mkdtempSync(join(tmpdir(), 'dicts-'));

describe('verifyAndPlace', () => {
  const genuine = new TextEncoder().encode('SET UTF-8\n');

  it('places a file whose hash matches', () => {
    const dest = join(tmp(), 'ar', 'ar.aff');
    verifyAndPlace('ar.aff', genuine, sha256(genuine), dest);
    expect(readFileSync(dest)).toEqual(Buffer.from(genuine));
  });

  it('rejects a tampered payload, names the file, and leaves nothing behind', () => {
    const dir = join(tmp(), 'ar');
    const tampered = new TextEncoder().encode('SET UTF-8\nevil\n');
    expect(() => verifyAndPlace('ar.dic', tampered, sha256(genuine), join(dir, 'ar.dic'))).toThrow(/ar\.dic: sha256 mismatch/);
    expect(existsSync(join(dir, 'ar.dic'))).toBe(false);
    expect(existsSync(join(dir, 'ar.dic.tmp'))).toBe(false);
  });
});

describe('provisionArabic', () => {
  it('copies the vendored pair when hashes match', () => {
    const dest = tmp();
    provisionArabic('dicts/ar', dest);
    expect(sha256(readFileSync(join(dest, 'ar.aff')))).toBe(sha256(readFileSync('dicts/ar/ar.aff')));
    expect(existsSync(join(dest, 'ar.dic'))).toBe(true);
  });

  it('refuses a tampered committed file, names it, and copies nothing', () => {
    const src = tmp();
    copyFileSync('dicts/ar/ar.aff', join(src, 'ar.aff'));
    writeFileSync(join(src, 'ar.dic'), readFileSync('dicts/ar/ar.dic').toString() + 'tampered\n');
    const dest = tmp();
    expect(() => provisionArabic(src, dest)).toThrow(/ar\.dic: sha256 mismatch/);
    expect(existsSync(join(dest, 'ar.aff'))).toBe(false);
    expect(existsSync(join(dest, 'ar.dic'))).toBe(false);
  });
});
