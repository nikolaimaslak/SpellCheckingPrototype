// The spelling error taxonomy, shared by the misspelling inserter and the
// benchmark reports. Dependency-free, so it runs directly under Node.
//
// Edits are named from the misspelling's point of view: `delete` means the
// misspelling lacks a letter of the intended word, `insert` that it has an
// extra one.

export type Lang = 'en' | 'ar';

export const EN_TYPES = ['keyboard-sub', 'substitute', 'transpose', 'delete', 'insert', 'double', 'undouble', 'case'] as const;
export const AR_TYPES = [
  'hamza',
  'ta-marbuta',
  'alef-maqsura',
  'emphatic',
  'dots',
  'keyboard-sub',
  'substitute',
  'delete',
  'insert',
  'transpose',
] as const;

/** A type a single edit can have. */
export type EditType = (typeof EN_TYPES)[number] | (typeof AR_TYPES)[number];
/** A type a whole misspelling can have. */
export type ErrorType = EditType | 'multi' | 'boundary';

export const TYPES: Record<Lang, readonly EditType[]> = { en: EN_TYPES, ar: AR_TYPES };

export interface Edit {
  op: 'sub' | 'ins' | 'del' | 'swap';
  type: EditType;
  /** Code-point index in the intended word (after removing Arabic marks). */
  at: number;
  /** The intended word's letter(s) at the edit; empty for `ins`. */
  from: string;
  /** The misspelling's letter(s) at the edit; empty for `del`. */
  to: string;
}

export interface Classification {
  type: ErrorType;
  edits: Edit[];
}

// Tashkeel and tatweel, as in src/spell/arabic.ts (copied: the server can't import src/).
const MARKS = /[ً-ٰٟۖ-ۭـ]/g;
export const stripMarks = (w: string) => w.replace(MARKS, '');

const ARABIC = /\p{Script=Arabic}/u;
const LATIN = /\p{Script=Latin}/u;
const scriptOf = (w: string): Lang | undefined => (ARABIC.test(w) ? (LATIN.test(w) ? undefined : 'ar') : LATIN.test(w) ? 'en' : undefined);

// ---------------------------------------------------------------------------
// Confusion sets

const pairs = (...groups: string[][]) => {
  const set = new Set<string>();
  for (const g of groups) for (const a of g) for (const b of g) if (a !== b) set.add(a + b);
  return set;
};

/** Hamza seat confusions: alef forms, waw/yaa seats, and the bare hamza against a seated one. */
const HAMZA = pairs(['ا', 'أ', 'إ', 'آ'], ['ؤ', 'و'], ['ئ', 'ي'], ['ئ', 'ى'], ['ء', 'ؤ'], ['ء', 'ئ'], ['ء', 'أ'], ['ء', 'إ']);
/** Letters carrying a hamza: dropping or adding one is a hamza error too ("مسول" for "مسؤول"). */
const HAMZA_LETTERS = new Set(['ء', 'أ', 'إ', 'آ', 'ؤ', 'ئ']);
const TA_MARBUTA = pairs(['ة', 'ه']);
const ALEF_MAQSURA = pairs(['ى', 'ي']);
const EMPHATIC = pairs(['ض', 'ظ'], ['ذ', 'ز'], ['ص', 'س'], ['ط', 'ت']);
/** Letters sharing a shape (rasm) that differ only in their dots. */
export const DOT_GROUPS = [
  ['ب', 'ت', 'ث', 'ن', 'ي'],
  ['ج', 'ح', 'خ'],
  ['د', 'ذ'],
  ['ر', 'ز'],
  ['س', 'ش'],
  ['ص', 'ض'],
  ['ط', 'ظ'],
  ['ع', 'غ'],
  ['ف', 'ق'],
];
const DOTS = pairs(...DOT_GROUPS);

export const CONFUSIONS = { hamza: HAMZA, 'ta-marbuta': TA_MARBUTA, 'alef-maqsura': ALEF_MAQSURA, emphatic: EMPHATIC, dots: DOTS };

// ---------------------------------------------------------------------------
// Keyboards: neighbours on a staggered layout. A key in row r, column c
// touches c±1 in its row, columns c and c+1 in the row above, and c-1 and c
// in the row below. null marks a key that types no single letter.

function neighbourMap(rows: (string | null)[][]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const at = (r: number, c: number) => rows[r]?.[c] ?? null;
  rows.forEach((row, r) =>
    row.forEach((key, c) => {
      if (!key) return;
      const near = [at(r, c - 1), at(r, c + 1), at(r - 1, c), at(r - 1, c + 1), at(r + 1, c - 1), at(r + 1, c)];
      map.set(key, new Set(near.filter((k): k is string => !!k)));
    }),
  );
  return map;
}

export const KEYBOARD: Record<Lang, Map<string, Set<string>>> = {
  en: neighbourMap(['qwertyuiop'.split(''), 'asdfghjkl'.split(''), 'zxcvbnm'.split('')]),
  // Arabic 101: Q-row, A-row, Z-row; the B key types the لا ligature.
  ar: neighbourMap([
    ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج', 'د'],
    ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
    ['ئ', 'ء', 'ؤ', 'ر', null, 'ى', 'ة', 'و', 'ز', 'ظ'],
  ]),
};

const isNeighbour = (lang: Lang, a: string, b: string) => KEYBOARD[lang].get(a.toLowerCase())?.has(b.toLowerCase()) ?? false;

/** The type of substituting intended letter `a` with `b`, by the documented precedence. */
export function substitutionType(lang: Lang, a: string, b: string): EditType {
  if (lang === 'en' && a !== b && a.toLowerCase() === b.toLowerCase()) return 'case';
  if (lang === 'ar') {
    for (const type of ['hamza', 'ta-marbuta', 'alef-maqsura', 'emphatic', 'dots'] as const) {
      if (CONFUSIONS[type].has(a + b)) return type;
    }
  }
  return isNeighbour(lang, a, b) ? 'keyboard-sub' : 'substitute';
}

/** Type of the misspelling having an extra `c` where its neighbours are `prev` and `next`. */
function insertionType(lang: Lang, c: string, prev: string | undefined, next: string | undefined): EditType {
  if (lang === 'ar') return HAMZA_LETTERS.has(c) ? 'hamza' : 'insert';
  return c === prev || c === next ? 'double' : 'insert';
}

/** Type of the misspelling lacking `c`, whose neighbours in the intended word are `prev` and `next`. */
function deletionType(lang: Lang, c: string, prev: string | undefined, next: string | undefined): EditType {
  if (lang === 'ar') return HAMZA_LETTERS.has(c) ? 'hamza' : 'delete';
  return c === prev || c === next ? 'undouble' : 'delete';
}

// ---------------------------------------------------------------------------
// Classification

/** Minimal OSA edit script turning `s` (intended) into `t` (misspelling). */
function editScript(s: string[], t: string[]): Omit<Edit, 'type'>[] {
  const d = Array.from({ length: s.length + 1 }, (_, i) => Array.from({ length: t.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  // Walk back, preferring match, then swap, substitution, deletion, insertion:
  // a fixed order keeps the script (and so the types) deterministic.
  const edits: Omit<Edit, 'type'>[] = [];
  let i = s.length;
  let j = t.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && s[i - 1] === t[j - 1] && d[i][j] === d[i - 1][j - 1]) {
      i--;
      j--;
    } else if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1] && s[i - 1] !== s[i - 2] && d[i][j] === d[i - 2][j - 2] + 1) {
      edits.push({ op: 'swap', at: i - 2, from: s[i - 2] + s[i - 1], to: t[j - 2] + t[j - 1] });
      i -= 2;
      j -= 2;
    } else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      edits.push({ op: 'sub', at: i - 1, from: s[i - 1], to: t[j - 1] });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      edits.push({ op: 'del', at: i - 1, from: s[i - 1], to: '' });
      i--;
    } else {
      edits.push({ op: 'ins', at: i, from: '', to: t[j - 1] });
      j--;
    }
  }
  return edits.reverse();
}

const BOUNDARY = /[\s\-‐]/gu;

/**
 * Classifies a misspelling against its intended word. Returns null when the
 * two are the same once Arabic marks are removed, or are in different scripts.
 */
export function classify(misspelled: string, intended: string, lang: Lang): Classification | null {
  const m = stripMarks(misspelled);
  const w = stripMarks(intended);
  if (m === w) return null;
  const sm = scriptOf(m.replace(BOUNDARY, ''));
  const sw = scriptOf(w.replace(BOUNDARY, ''));
  if (!sm || sm !== sw) return null;
  if ((m.match(BOUNDARY) ?? []).length !== (w.match(BOUNDARY) ?? []).length) return { type: 'boundary', edits: [] };

  const s = [...w];
  const t = [...m];
  const edits: Edit[] = editScript(s, t).map((e) => {
    switch (e.op) {
      case 'swap':
        return { ...e, type: 'transpose' };
      case 'sub':
        return { ...e, type: substitutionType(lang, e.from, e.to) };
      case 'del':
        return { ...e, type: deletionType(lang, e.from, s[e.at - 1], s[e.at + 1]) };
      case 'ins': {
        // Neighbours of the extra letter in the misspelling: the intended
        // letters on either side of the insertion point.
        return { ...e, type: insertionType(lang, e.to, s[e.at - 1], s[e.at]) };
      }
    }
  });
  return { type: edits.length === 1 ? edits[0].type : 'multi', edits };
}

// ---------------------------------------------------------------------------
// Insertion

/** Deterministic PRNG in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(items: readonly T[], rng: () => number): T => items[Math.floor(rng() * items.length)];

const LETTERS: Record<Lang, string[]> = {
  en: 'abcdefghijklmnopqrstuvwxyz'.split(''),
  ar: 'ابتثجحخدذرزسشصضطظعغفقكلمنهويءآأإؤئىة'.split(''),
};

const isLetter = (c: string) => /\p{L}/u.test(c);

/**
 * Where agents actually make hamza errors: on a letter that carries a hamza
 * (dropping it or using the wrong seat), or on a bare alef at the start of the
 * word or after the article (adding one that isn't there, as in "إستمارة").
 */
function realisticHamza(s: string[], i: number): boolean {
  if (HAMZA_LETTERS.has(s[i])) return true;
  if (s[i] !== 'ا') return false;
  const article = s[0] === 'ا' && s[1] === 'ل';
  // The article's own alef never takes a hamza; the first letter after it can.
  return article ? i === 2 : i === 0;
}

/** Every single-edit variant of `word` that classifies as `type`, in a stable order. */
export function variants(word: string, type: EditType, lang: Lang): string[] {
  const s = [...stripMarks(word)];
  const out = new Set<string>();
  const join = (chars: string[]) => chars.join('');
  const keep = (v: string) => {
    if (classify(v, word, lang)?.type === type) out.add(v);
  };
  const near = (c: string) => [...(KEYBOARD[lang].get(c.toLowerCase()) ?? [])];

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!isLetter(c)) continue;
    switch (type) {
      case 'transpose':
        if (i + 1 < s.length && isLetter(s[i + 1]) && s[i + 1] !== c) keep(join([...s.slice(0, i), s[i + 1], c, ...s.slice(i + 2)]));
        break;
      case 'delete':
      case 'undouble':
      case 'hamza':
        if (type !== 'hamza' || HAMZA_LETTERS.has(c)) keep(join([...s.slice(0, i), ...s.slice(i + 1)]));
        if (type === 'hamza' && realisticHamza(s, i)) {
          for (const b of LETTERS.ar) keep(join([...s.slice(0, i), b, ...s.slice(i + 1)]));
        }
        break;
      case 'double':
        keep(join([...s.slice(0, i + 1), c, ...s.slice(i + 1)]));
        break;
      case 'insert':
        // A key next to the letter typed before or after it.
        for (const b of near(c)) {
          keep(join([...s.slice(0, i), b, ...s.slice(i)]));
          keep(join([...s.slice(0, i + 1), b, ...s.slice(i + 1)]));
        }
        break;
      case 'case':
        keep(join([...s.slice(0, i), c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase(), ...s.slice(i + 1)]));
        break;
      case 'keyboard-sub':
        for (const b of near(c)) keep(join([...s.slice(0, i), c === c.toUpperCase() && lang === 'en' ? b.toUpperCase() : b, ...s.slice(i + 1)]));
        break;
      case 'alef-maqsura':
        // ى anywhere; ي only at the end, where the two are confused.
        if (c === 'ى' || (c === 'ي' && i === s.length - 1)) keep(join([...s.slice(0, i), c === 'ى' ? 'ي' : 'ى', ...s.slice(i + 1)]));
        break;
      default:
        // ta-marbuta, emphatic, dots, substitute: any letter that classifies as the type.
        for (const b of LETTERS[lang]) keep(join([...s.slice(0, i), b, ...s.slice(i + 1)]));
    }
  }
  return [...out];
}

/** One random single-edit variant of `word` of the given type, or null when none applies. */
export function apply(word: string, type: EditType, lang: Lang, rng: () => number): string | null {
  const options = variants(word, type, lang);
  return options.length ? pick(options, rng) : null;
}
