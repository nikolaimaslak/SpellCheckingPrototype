// Provisions spelling dictionaries.
//   English: copied from the dictionary-en npm package into public/dicts/en/ (offline).
//   Arabic:  downloaded from a pinned LibreOffice commit into .local-dicts/ar/,
//            sha256-verified. Licensing is an open legal item: local evaluation
//            only, never committed, excluded from builds unless INCLUDE_AR_DICT=1.
// Usage: node scripts/fetch-dicts.ts [--en-only]
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const AR_COMMIT = '32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4';
export const AR_FILES: Record<string, string> = {
  'ar.aff': 'cec30b8621001e49618feb05aec1984c5fcfbf7d2ec309901d5cbf66585217a3',
  'ar.dic': '2a3e5367f61c1583734db9d66734f5603e6be5c2d227cf5c5cd7e4ca586e34fe',
};
const AR_BASE = `https://raw.githubusercontent.com/LibreOffice/dictionaries/${AR_COMMIT}/ar/`;

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

function provisionEnglish(): void {
  const src = join(ROOT, 'node_modules/dictionary-en');
  const dest = join(ROOT, 'public/dicts/en');
  mkdirSync(dest, { recursive: true });
  copyFileSync(join(src, 'index.aff'), join(dest, 'en.aff'));
  copyFileSync(join(src, 'index.dic'), join(dest, 'en.dic'));
  console.log('fetch-dicts: English ready (public/dicts/en)');
}

async function provisionArabic(): Promise<void> {
  const dest = join(ROOT, '.local-dicts/ar');
  const present = Object.entries(AR_FILES).every(
    ([name, hash]) => existsSync(join(dest, name)) && sha256(readFileSync(join(dest, name))) === hash,
  );
  if (present) {
    console.log('fetch-dicts: Arabic already present (.local-dicts/ar)');
    return;
  }

  const downloads: [string, Uint8Array][] = [];
  try {
    for (const name of Object.keys(AR_FILES)) {
      const res = await fetch(AR_BASE + name);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${name}`);
      downloads.push([name, new Uint8Array(await res.arrayBuffer())]);
    }
  } catch (err) {
    console.warn(`fetch-dicts: Arabic skipped (${(err as Error).message})`);
    return;
  }

  try {
    for (const [name, data] of downloads) {
      verifyAndPlace(name, data, AR_FILES[name], join(dest, name));
    }
  } catch (err) {
    rmSync(dest, { recursive: true, force: true });
    throw err;
  }
  console.log('fetch-dicts: Arabic ready (.local-dicts/ar) — local evaluation only, license pending legal review');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  provisionEnglish();
  if (!process.argv.includes('--en-only')) {
    await provisionArabic();
  }
}
