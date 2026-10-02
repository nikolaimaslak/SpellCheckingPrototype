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
});
