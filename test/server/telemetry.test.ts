import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendEvents, readEvents, renderSummary, sanitize, summarize, type StoredEvent } from '../../server/telemetry';

describe('telemetry', () => {
  it('drops non-allowlisted fields such as text', () => {
    const e = sanitize({ type: 'completion-accepted', ts: 1, lang: 'en', latencyMs: 300, acceptedLength: 22, text: 'secret completion', prefix: 'typed text' });
    expect(e).toEqual({ type: 'completion-accepted', ts: 1, lang: 'en', latencyMs: 300, acceptedLength: 22 });
    expect(sanitize({ type: 'autocorrect', ts: 1, original: 'seperate', replacement: 'separate', transcript: 'x' })).toEqual({
      type: 'autocorrect', ts: 1, original: 'seperate', replacement: 'separate',
    });
    expect(sanitize({ type: 'evil' })).toBeNull();
    expect(sanitize({ type: 'completion-shown', shownLength: 'x'.repeat(100) })).not.toHaveProperty('shownLength');
  });

  it('appends one line per event and reads them back', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'tel-')), 'telemetry/events.jsonl');
    expect(appendEvents(file, [{ type: 'revert', ts: 1 }, { type: 'accept', ts: 2 }, { type: 'nope' }])).toBe(2);
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2);
    expect(readEvents(file).map((e) => e.type)).toEqual(['revert', 'accept']);
  });

  it('computes acceptance, revert rate and latency percentiles', () => {
    const events: StoredEvent[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ type: 'completion-shown' as const, ts: i, lang: 'en', latencyMs: (i + 1) * 100 })),
      ...Array.from({ length: 4 }, (_, i) => ({ type: 'completion-accepted' as const, ts: i })),
      ...Array.from({ length: 5 }, (_, i) => ({ type: 'autocorrect' as const, ts: i, lang: 'ar' })),
      { type: 'revert', ts: 0, lang: 'ar' },
    ];
    const s = summarize(events);
    expect(s.completion.acceptanceRate).toBeCloseTo(0.4);
    expect(s.autocorrect.revertRate).toBeCloseTo(0.2);
    expect(s.completion.latencyP50).toBe(500);
    expect(s.completion.latencyP95).toBe(1000);
    const html = renderSummary(s);
    expect(html).toContain('40%');
    expect(html).toContain('20%');
  });
});

describe('polish telemetry', () => {
  it('keeps only latency and change count for polish events', () => {
    expect(sanitize({ type: 'polish-shown', ts: 1, lang: 'ar', latencyMs: 900, changes: 2, draft: 'secret', polished: 'secret' })).toEqual({
      type: 'polish-shown', ts: 1, lang: 'ar', latencyMs: 900, changes: 2,
    });
    expect(sanitize({ type: 'polish-reverted', ts: 1, text: 'x' })).toEqual({ type: 'polish-reverted', ts: 1 });
  });

  it('computes polish acceptance over previews with changes', () => {
    const events: StoredEvent[] = [
      ...Array.from({ length: 4 }, (_, i) => ({ type: 'polish-shown' as const, ts: i, changes: 2, latencyMs: 800 + i * 100 })),
      { type: 'polish-shown', ts: 9, changes: 0, latencyMs: 700 },
      ...Array.from({ length: 3 }, (_, i) => ({ type: 'polish-accepted' as const, ts: i })),
    ];
    const s = summarize(events);
    expect(s.polish.acceptanceRate).toBeCloseTo(0.75);
    expect(renderSummary(s)).toContain('75%');
  });

  it('reports revert rates per language (spec: Revert rate per language)', () => {
    const ac = (lang: string, original: string, replacement: string) => ({ type: 'autocorrect' as const, ts: 0, lang, original, replacement });
    const events: StoredEvent[] = [
      ...['seperate', 'paymnet', 'reqeust', 'pensoin'].map((w) => ac('en', w, 'x')),
      ...['النضام', 'اذا', 'الطلبب', 'التسجبل'].map((w) => ac('ar', w, 'y')),
      { type: 'revert', ts: 1, lang: 'ar', original: 'النضام', replacement: 'y' },
      { type: 'revert', ts: 2, lang: 'ar', original: 'اذا', replacement: 'y' },
    ];
    const s = summarize(events);
    expect(s.spelling.en!.revertRate).toBe(0);
    expect(s.spelling.ar!.revertRate).toBe(0.5);
    expect(s.autocorrect.revertRate).toBe(0.25);
  });

  it('reports the ignore share as the field proxy for false flags (spec: Ignore share)', () => {
    const events: StoredEvent[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ type: 'accept' as const, ts: i, lang: 'ar', original: 'اذا', replacement: 'إذا' })),
      ...Array.from({ length: 2 }, (_, i) => ({ type: 'ignore' as const, ts: i, lang: 'ar', original: 'عبدالله' })),
    ];
    const s = summarize(events);
    expect(s.spelling.ar!.ignoreShare).toBe(0.25);
    expect(renderSummary(s)).toMatch(/ignore share approximates the false-flag rate/);
  });

  it('classifies field corrections with the benchmark taxonomy (spec: Field error types)', () => {
    const events: StoredEvent[] = [
      { type: 'accept', ts: 0, lang: 'ar', original: 'اذا', replacement: 'إذا' },
      { type: 'accept', ts: 1, lang: 'ar', original: 'المساعده', replacement: 'المساعدة' },
      { type: 'autocorrect', ts: 2, lang: 'ar', original: 'النضام', replacement: 'النظام' },
      { type: 'revert', ts: 3, lang: 'ar', original: 'النضام', replacement: 'النظام' },
    ];
    const ar = summarize(events).spelling.ar!;
    expect(ar.errorTypes).toEqual({ hamza: 1, 'ta-marbuta': 1, emphatic: 1 });
    expect(ar.revertsByType.emphatic).toEqual({ autocorrects: 1, reverts: 1, revertRate: 1 });
    expect(renderSummary(summarize(events))).toContain('ar: error types in the field');
  });
});


describe('withheld completions (older log lines from the removed safety filter)', () => {
  it('stores only an allowed reason, never text', () => {
    expect(sanitize({ type: 'completion-withheld', ts: 1, lang: 'en', reason: 'figure', completion: ' within 3 days' })).toEqual({ type: 'completion-withheld', ts: 1, lang: 'en', reason: 'figure' });
    expect(sanitize({ type: 'completion-withheld', ts: 1, reason: 'secret text' })).toEqual({ type: 'completion-withheld', ts: 1 });
    expect(sanitize({ type: 'completion-shown', ts: 1, reason: 'figure' })).toEqual({ type: 'completion-shown', ts: 1 });
  });

  it('counts withheld completions by reason next to those shown', () => {
    const ev = (type: StoredEvent['type'], reason?: StoredEvent['reason']): StoredEvent => ({ type, ts: 1, lang: 'en', ...(reason ? { reason } : {}) });
    const events = [
      ...Array.from({ length: 10 }, () => ev('completion-shown')),
      ...Array.from({ length: 3 }, () => ev('completion-withheld', 'figure')),
      ev('completion-withheld', 'conversation'),
    ];
    const s = summarize(events);
    expect(s.completion.withheld).toEqual({ figure: 3, date: 0, identifier: 0, conversation: 1, format: 0, spelling: 0 });
    expect(renderSummary(s)).toContain('figure 3 · date 0 · identifier 0 · conversation 1 · format 0 · spelling 0 · next to 10 shown');
  });
});

describe('reason spelling stays accepted', () => {
  it('keeps reason spelling and counts it', () => {
    expect(sanitize({ type: 'completion-withheld', ts: 1, lang: 'en', reason: 'spelling', word: 'ben' })).toEqual({ type: 'completion-withheld', ts: 1, lang: 'en', reason: 'spelling' });
    const ev = (reason: StoredEvent['reason']): StoredEvent => ({ type: 'completion-withheld', ts: 1, lang: 'en', reason });
    expect(summarize([ev('spelling'), ev('spelling'), ev('figure')]).completion.withheld).toMatchObject({ spelling: 2, figure: 1 });
  });
});


describe('unusable model output (completion-structured-output)', () => {
  it('keeps reason format and counts it', () => {
    expect(sanitize({ type: 'completion-withheld', ts: 1, lang: 'ar', reason: 'format', raw: '{"word":"x"}' })).toEqual({ type: 'completion-withheld', ts: 1, lang: 'ar', reason: 'format' });
    const ev = (): StoredEvent => ({ type: 'completion-withheld', ts: 1, lang: 'en', reason: 'format' });
    const s = summarize([ev(), ev(), ev(), ev()]);
    expect(s.completion.withheld).toMatchObject({ format: 4 });
    expect(renderSummary(s)).toContain('format 4');
  });
});

describe('summary label (completion-remove-safety-filter)', () => {
  it('labels withheld completions without Req 3.7', () => {
    const html = renderSummary(summarize([{ type: 'completion-withheld', ts: 1, lang: 'en', reason: 'format' }]));
    expect(html).toContain('Completions withheld<div');
    expect(html).not.toContain('Req 3.7');
  });
});
