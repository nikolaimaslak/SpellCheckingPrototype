// Provisions spelling dictionaries into public/dicts/ (offline; no downloads).
//   English: copied from the dictionary-en npm package.
//   Arabic:  copied from the vendored dicts/ar/ (AyaSpell, MPL 1.1 elected),
//            after checking the pinned sha256 hashes.
// Usage: node scripts/fetch-dicts.ts
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Upstream: LibreOffice/dictionaries @ 32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4, ar/. */
export const AR_FILES: Record<string, string> = {
  'ar.aff': 'cec30b8621001e49618feb05aec1984c5fcfbf7d2ec309901d5cbf66585217a3',
  'ar.dic': '2a3e5367f61c1583734db9d66734f5603e6be5c2d227cf5c5cd7e4ca586e34fe',
};

export const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

/**
 * Writes `data` to `dest` only if it matches `expected`. Goes through a temp
 * file and a rename, so a failed check never leaves a partial file behind.
 */
export function verifyAndPlace(name: string, data: Uint8Array, expected: string, dest: string): void {
  const actual = sha256(data);
  if (actual !== expected) {
    throw new Error(`${name}: sha256 mismatch (expected ${expected}, got ${actual})`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, dest);
}

/** Verifies every vendored Arabic file before copying any of them. */
export function provisionArabic(srcDir: string, destDir: string): void {
  const files = Object.entries(AR_FILES).map(([name, hash]) => {
    const data = readFileSync(join(srcDir, name));
    if (sha256(data) !== hash) {
      throw new Error(`${name}: sha256 mismatch (expected ${hash}, got ${sha256(data)})`);
    }
    return { name, hash, data };
  });
  for (const { name, hash, data } of files) {
    verifyAndPlace(name, data, hash, join(destDir, name));
  }
}

function provisionEnglish(): void {
  const src = join(ROOT, 'node_modules/dictionary-en');
  const dest = join(ROOT, 'public/dicts/en');
  mkdirSync(dest, { recursive: true });
  copyFileSync(join(src, 'index.aff'), join(dest, 'en.aff'));
  copyFileSync(join(src, 'index.dic'), join(dest, 'en.dic'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  provisionEnglish();
  provisionArabic(join(ROOT, 'dicts/ar'), join(ROOT, 'public/dicts/ar'));
  console.log('fetch-dicts: English and Arabic ready (public/dicts)');
}
