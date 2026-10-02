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

  it('does not check languages that are not ready', async () => {
    const { requester, sent } = fakeRequester(); // Arabic never released
    const service = createSpellService(requester);
    await flush();
    await service.check({ ar: ['اذا'] });
    expect(sent.filter((c) => c.type === 'check')).toHaveLength(0);
    expect(service.misspelled('ar', 'اذا')).toBeUndefined();
  });
});
