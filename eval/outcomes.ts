// Turns a pipeline run of one labelled message into one outcome per gold unit
// (word or excluded span). Labels must line up with the tokenizer's words: a
// label that doesn't is a data error and fails the run, because silently
// mis-aligned gold labels would corrupt every metric.
import { classify, stripMarks, type Lang } from './error-types.ts';
import type { PipelineResult, TokenResult } from './pipeline.ts';
import type { Label, Message, WordOutcome } from './types.ts';

export class AlignmentError extends Error {}

/** Same word, ignoring Arabic diacritics and tatweel; hamza and case still count. */
export const sameWord = (a: string, b: string) => stripMarks(a) === stripMarks(b);

/** The system's ranked corrections: the auto-replacement first, then the suggestions, without duplicates. */
export function rankedCorrections(t: Pick<TokenResult, 'replacement' | 'suggestions'>): string[] {
  const out: string[] = [];
  for (const c of [t.replacement, ...t.suggestions]) if (c && !out.some((o) => sameWord(o, c))) out.push(c);
  return out;
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

export function outcomesFor(dataset: string, message: Message, result: PipelineResult): WordOutcome[] {
  const labels = message.labels ?? [];
  const fail = (why: string): never => {
    throw new AlignmentError(`${dataset} message ${message.id}: ${why}`);
  };
  for (const l of labels) {
    if (message.text.slice(l.start, l.start + l.word.length) !== l.word) fail(`label "${l.word}" at ${l.start} doesn't match the text`);
    if (l.gold === 'misspelled' && !l.intended) fail(`misspelled label "${l.word}" has no intended word`);
  }

  const excluded = labels.filter((l) => l.gold === 'excluded').map((l) => ({ label: l, start: l.start, end: l.start + l.word.length }));
  const wordLabels = new Map(labels.filter((l) => l.gold !== 'excluded').map((l) => [l.start, l]));
  const base = { dataset, messageId: message.id, context: message.text };
  const out: WordOutcome[] = [];
  const leaked = new Set<Label>();

  for (const t of result.tokens) {
    const span = excluded.find((x) => overlaps(x, t));
    if (span) {
      leaked.add(span.label);
      continue;
    }
    const label = wordLabels.get(t.start);
    if (label) {
      wordLabels.delete(t.start);
      if (label.word !== t.word) fail(`label "${label.word}" at ${label.start} doesn't match the word "${t.word}"`);
    }
    out.push(outcomeOf(t, label, base));
  }
  for (const l of wordLabels.values()) fail(`label "${l.word}" at ${l.start} matches no word the tokenizer produces`);

  for (const r of result.transient) {
    const span = excluded.find((x) => overlaps(x, r));
    if (span) leaked.add(span.label);
    else {
      // A word of the text typed so far that the finished text doesn't have,
      // changed while typing: a corruption of correct text.
      out.push({
        ...base,
        lang: r.lang,
        word: r.word,
        start: r.start,
        gold: 'correct',
        intended: null,
        outcome: 'corruption',
        errorType: null,
        rank: null,
        replacement: r.replacement,
        source: r.replacementSource,
        corrections: [r.replacement],
        correctionType: classify(r.word, r.replacement, r.lang)?.type ?? null,
      });
    }
  }
  for (const { label } of excluded) {
    out.push({
      ...base,
      lang: null,
      word: label.word,
      start: label.start,
      gold: 'excluded',
      intended: null,
      outcome: leaked.has(label) ? 'exclusion-leak' : 'excluded',
      errorType: null,
      rank: null,
      replacement: null,
      source: null,
      corrections: [],
      correctionType: null,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

function outcomeOf(t: TokenResult, label: Label | undefined, base: { dataset: string; messageId: string; context: string }): WordOutcome {
  const lang: Lang = t.lang;
  const detected = t.flagged || t.replacement !== null;
  const corrections = detected ? rankedCorrections(t) : [];
  const correctionType = corrections.length ? (classify(t.word, corrections[0], lang)?.type ?? null) : null;
  const common = { ...base, lang, word: t.word, start: t.start, replacement: t.replacement, source: t.replacementSource, corrections, correctionType };

  if (!label || label.gold === 'correct') {
    const outcome = t.replacement ? 'corruption' : t.flagged ? 'false-flag' : 'untouched';
    return { ...common, gold: 'correct', intended: null, outcome, errorType: null, rank: null };
  }
  const intended = label.intended!;
  const errorType = label.type ?? classify(t.word, intended, lang)?.type ?? null;
  const index = corrections.findIndex((c) => sameWord(c, intended));
  const rank = detected && index >= 0 ? index + 1 : null;
  const outcome = !detected ? 'missed' : t.replacement ? (sameWord(t.replacement, intended) ? 'fixed' : 'wrong-fix') : 'flagged';
  return { ...common, gold: 'misspelled', intended, outcome, errorType, rank };
}
