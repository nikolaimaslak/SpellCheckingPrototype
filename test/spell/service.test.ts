import { describe, expect, it } from 'vitest';
import type { Lang, SpellCommand } from '../../src/spell/protocol';
import { createSpellService, type SpellRequester } from '../../src/spell/service';

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

describe('spell service', () => {
  it('makes English ready before Arabic finishes loading', async () => {
    const { requester, releaseArabic } = fakeRequester();
    const service = createSpellService(requester);
    const states: string[] = [];
    service.onStatus((s) => states.push(`${s.state}:${s.loaded.map((l) => l.lang).join(',')}`));
    await flush();
    expect(service.isReady('en')).toBe(true);
    expect(service.isReady('ar')).toBe(false);
    expect(service.status.pending).toEqual(['ar']);
    releaseArabic();
    await flush();
    expect(service.isReady('ar')).toBe(true);
    expect(states).toEqual(['ready:en', 'ready:en,ar']);
  });

  it('caches results and never re-sends a known word', async () => {
    const { requester, sent, releaseArabic } = fakeRequester();
    releaseArabic();
    const service = createSpellService(requester);
    await flush();
    await service.check({ en: ['receive', 'recieve'], ar: ['اذا'] });
    expect(service.misspelled('en', 'recieve')).toBe(true);
    expect(service.misspelled('en', 'receive')).toBe(false);
    expect(service.misspelled('ar', 'اذا')).toBe(true);
    const checksBefore = sent.filter((c) => c.type === 'check').length;
    await service.check({ en: ['recieve', 'receive'] });
    expect(sent.filter((c) => c.type === 'check').length).toBe(checksBefore);
  });

  it('shares in-flight and cached results between callers (two composers)', async () => {
    const { requester, sent, releaseArabic } = fakeRequester();
    releaseArabic();
    const service = createSpellService(requester);
    await flush();
    await Promise.all([service.check({ en: ['recieve'] }), service.check({ en: ['recieve'] })]);
    expect(sent.filter((c) => c.type === 'check')).toHaveLength(1);
  });

  it('caches neighbors per word, sharing in-flight requests', async () => {
    const { requester, sent, releaseArabic } = fakeRequester();
    releaseArabic();
    const service = createSpellService(requester);
    await flush();
    const [a, b] = await Promise.all([service.neighbors('en', 'recieve'), service.neighbors('en', 'recieve')]);
    expect(a).toEqual(['receive', 'relieve']);
    expect(b).toBe(a);
    await service.neighbors('en', 'recieve');
    await service.neighbors('ar', 'recieve');
    expect(sent.filter((c) => c.type === 'neighbors')).toEqual([
      { type: 'neighbors', lang: 'en', word: 'recieve' },
      { type: 'neighbors', lang: 'ar', word: 'recieve' },
    ]);
  });

  it('does not cache a failed neighbors request', async () => {
    const { requester, sent, releaseArabic } = fakeRequester();
    releaseArabic();
    const service = createSpellService(requester);
    await flush();
    await expect(service.neighbors('en', 'boom')).rejects.toThrow('worker failed');
    await expect(service.neighbors('en', 'boom')).rejects.toThrow('worker failed');
    expect(sent.filter((c) => c.type === 'neighbors')).toHaveLength(2);
  });

  it('does not check languages that are not ready', async () => {
    const { requester, sent } = fakeRequester(); // Arabic never released
    const service = createSpellService(requester);
    await flush();
    await service.check({ ar: ['اذا'] });
    expect(sent.filter((c) => c.type === 'check')).toHaveLength(0);
    expect(service.misspelled('ar', 'اذا')).toBeUndefined();
  });
});

describe('custom dictionary', () => {
  it('adds custom words to the matching engine before publishing each language as ready', async () => {
    const { requester, sent, releaseArabic } = fakeRequester();
    const service = createSpellService(requester, { customWords: ['GOSI', 'التأمينات', 'two words', 'Absher'] });
    const order: string[] = [];
    service.onStatus((s) => order.push(`ready:${s.loaded.map((l) => l.lang).join(',')}`));
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
    createSpellService(requester, { customWords: ['two words'] });
    await flush();
    expect(sent.some((c) => c.type === 'add')).toBe(false);
  });
});
