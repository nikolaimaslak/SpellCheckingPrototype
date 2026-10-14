import { describe, expect, it, vi } from 'vitest';
import type { Lang, SpellCommand } from '../../src/spell/protocol';
import { createSpellChecker, workerRequester, type SpellPort, type SpellRequester } from '../../src/spell/checker';

/** Fake worker: English and Arabic load (Arabic after `releaseArabic`), "recieve" is wrong. */
function fakeRequester() {
  const sent: SpellCommand[] = [];
  let releaseArabic!: () => void;
  const arabicGate = new Promise<void>((r) => (releaseArabic = r));
  const requester: SpellRequester = {
    async request(command: SpellCommand) {
      sent.push(command);
      switch (command.type) {
        case 'load': {
          const lang = command.langs[0];
          if (lang === 'ar') await arabicGate;
          return { loaded: [{ lang, ms: 1 }], failed: [] } as never;
        }
        case 'check': {
          const misspelled: Partial<Record<Lang, string[]>> = {};
          for (const [lang, words] of Object.entries(command.words) as [Lang, string[]][]) {
            misspelled[lang] = words.filter((w) => w === 'recieve' || w === 'اذا');
          }
          return { misspelled, unchecked: {} } as never;
        }
        case 'suggest':
          return ['receive'] as never;
        case 'neighbors':
          if (command.word === 'boom') throw new Error('worker failed');
          return ['receive', 'relieve'] as never;
        default:
          return null as never;
      }
    },
  };
  return { requester, sent, releaseArabic };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('spell checker', () => {
  it('makes English ready before Arabic finishes loading', async () => {
    const { requester, releaseArabic } = fakeRequester();
    const checker = createSpellChecker(requester);
    const states: string[] = [];
    checker.onStatus((s) => states.push(`${s.state}:${s.loaded.map((l) => l.lang).join(',')}`));
    await flush();
    expect(checker.isReady('en')).toBe(true);
    expect(checker.isReady('ar')).toBe(false);
    expect(checker.status.pending).toEqual(['ar']);
    releaseArabic();
    await flush();
    expect(checker.isReady('ar')).toBe(true);
    expect(states).toEqual(['ready:en', 'ready:en,ar']);
  });

  it('caches results and never re-sends a known word', async () => {
    const { requester, sent, releaseArabic } = fakeRequester();
    releaseArabic();
    const checker = createSpellChecker(requester);
    await flush();
    await checker.check({ en: ['receive', 'recieve'], ar: ['اذا'] });
    expect(checker.misspelled('en', 'recieve')).toBe(true);
    expect(checker.misspelled('en', 'receive')).toBe(false);
    expect(checker.misspelled('ar', 'اذا')).toBe(true);
    const checksBefore = sent.filter((c) => c.type === 'check').length;
    await checker.check({ en: ['recieve', 'receive'] });
    expect(sent.filter((c) => c.type === 'check').length).toBe(checksBefore);
  });

  it('shares in-flight and cached results between callers (two callers)', async () => {
    const { requester, sent, releaseArabic } = fakeRequester();
    releaseArabic();
    const checker = createSpellChecker(requester);
    await flush();
    await Promise.all([checker.check({ en: ['recieve'] }), checker.check({ en: ['recieve'] })]);
    expect(sent.filter((c) => c.type === 'check')).toHaveLength(1);
  });

  it('caches neighbors per word, sharing in-flight requests', async () => {
    const { requester, sent, releaseArabic } = fakeRequester();
    releaseArabic();
    const checker = createSpellChecker(requester);
    await flush();
    const [a, b] = await Promise.all([checker.neighbors('en', 'recieve'), checker.neighbors('en', 'recieve')]);
    expect(a).toEqual(['receive', 'relieve']);
    expect(b).toBe(a);
    await checker.neighbors('en', 'recieve');
    await checker.neighbors('ar', 'recieve');
    expect(sent.filter((c) => c.type === 'neighbors')).toEqual([
      { type: 'neighbors', lang: 'en', word: 'recieve' },
      { type: 'neighbors', lang: 'ar', word: 'recieve' },
    ]);
  });

  it('does not cache a failed neighbors request', async () => {
    const { requester, sent, releaseArabic } = fakeRequester();
    releaseArabic();
    const checker = createSpellChecker(requester);
    await flush();
    await expect(checker.neighbors('en', 'boom')).rejects.toThrow('worker failed');
    await expect(checker.neighbors('en', 'boom')).rejects.toThrow('worker failed');
    expect(sent.filter((c) => c.type === 'neighbors')).toHaveLength(2);
  });

  it('does not check languages that are not ready', async () => {
    const { requester, sent } = fakeRequester(); // Arabic never released
    const checker = createSpellChecker(requester);
    await flush();
    await checker.check({ ar: ['اذا'] });
    expect(sent.filter((c) => c.type === 'check')).toHaveLength(0);
    expect(checker.misspelled('ar', 'اذا')).toBeUndefined();
  });
});

describe('custom dictionary', () => {
  it('adds custom words to the matching engine before publishing each language as ready', async () => {
    const { requester, sent, releaseArabic } = fakeRequester();
    const checker = createSpellChecker(requester, { customWords: ['GOSI', 'التأمينات', 'two words', 'Absher'] });
    const order: string[] = [];
    checker.onStatus((s) => order.push(`ready:${s.loaded.map((l) => l.lang).join(',')}`));
    await flush();
    releaseArabic();
    await flush();
    const adds = sent.filter((c) => c.type === 'add').map((c) => c.type === 'add' && `${c.lang}:${c.word}`);
    expect(adds).toEqual(['en:GOSI', 'en:Absher', 'ar:التأمينات']);
    // each add precedes the ready event of its language
    const enReadyIdx = sent.findIndex((c) => c.type === 'load' && c.langs[0] === 'ar'); // ar load is sent after en is published
    expect(sent.findIndex((c) => c.type === 'add' && c.word === 'GOSI')).toBeLessThan(enReadyIdx);
    expect(order).toEqual(['ready:en', 'ready:en,ar']);
  });

  it('skips words with whitespace', async () => {
    const { requester, sent, releaseArabic } = fakeRequester();
    releaseArabic();
    createSpellChecker(requester, { customWords: ['two words'] });
    await flush();
    expect(sent.some((c) => c.type === 'add')).toBe(false);
  });
});

describe('checker.terminate', () => {
  it('terminates the requester', () => {
    const terminate = vi.fn();
    const checker = createSpellChecker({ request: () => new Promise(() => {}), terminate });
    checker.terminate();
    expect(terminate).toHaveBeenCalledOnce();
  });
});

describe('workerRequester', () => {
  it('matches replies to requests by id and rejects errors', async () => {
    let listener!: (e: MessageEvent) => void;
    const posted: { id: number }[] = [];
    const port: SpellPort = { postMessage: (m) => posted.push(m as { id: number }), addEventListener: (_t, l) => (listener = l as never) };
    const requester = workerRequester(port);
    const a = requester.request({ type: 'spell', lang: 'en', word: 'x' });
    const b = requester.request({ type: 'spell', lang: 'en', word: 'y' });
    listener({ data: { id: posted[1].id, ok: false, error: 'boom' } } as MessageEvent);
    listener({ data: { id: posted[0].id, ok: true, result: true } } as MessageEvent);
    await expect(a).resolves.toBe(true);
    await expect(b).rejects.toThrow('boom');
  });

  it('terminates the worker and rejects pending and later requests', async () => {
    const port: SpellPort = { postMessage: vi.fn(), addEventListener: vi.fn(), terminate: vi.fn() };
    const requester = workerRequester(port);
    const pending = requester.request({ type: 'spell', lang: 'en', word: 'x' });
    requester.terminate!();
    await expect(pending).rejects.toThrow(/terminated/);
    await expect(requester.request({ type: 'spell', lang: 'en', word: 'y' })).rejects.toThrow(/terminated/);
    expect(port.terminate).toHaveBeenCalledOnce();
  });
});
