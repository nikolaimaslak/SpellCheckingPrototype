// @vitest-environment jsdom
// The benchmark is only meaningful if its pipeline decides like the composer.
// Both run on the real engine here; the composer gets each message typed
// character by character (so . @ : / hold words as they do for an agent),
// ending with a space so every word is completed.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { attachSpellCheck, type AssistEvent } from '../../src/composer';
import { createHandler } from '../../src/spell/handler';
import type { ResultByType, SpellCommand, SpellRequest } from '../../src/spell/protocol';
import { createSpellService, type SpellService } from '../../src/spell/service';
import { createPipeline, loadDictionary, loadRuntime, type Pipeline } from '../../eval/pipeline';
import { composer, fakeHighlightEnv, textReplace, typeChars } from '../composer/fakes';

const CUSTOM = ['GOSI', 'Absher', 'التأمينات'];
const MESSAGES = [
  'please seperate them',
  'I will recieve the paymnet tomorow',
  'Your pensoin reqeust was registerd',
  'Thank you for contacting GOSI and Absher',
  'case CS-104233 sent to info@gosi.gov.sa',
  'النضام لا يعمل اذا كان الطلبب جديدا',
  'شكرا على تواصلك مع التامينات الاجتماعيه',
  'مرحيا كيف يمكنتي مساعدتك',
  'رقم النضام هو paymnet',
  'طلبك رقم ١٢٣٤٥ في نظام GOSSI قيد المراجعه',
  'You can also email us at info@gosi.gov.sa with your request.',
  'visit https://www.gosi.gov.sa/en for details',
  'راسلنا على info@gosi.gov.sa بخصوص المستخذم',
  'please seperate. Thanks',
  'oNly thiS dOcument',
  'teh customer said Teh form is ready',
  'Ms. Fatimah, I have sent you the form.',
  'Thanks. Seperate forms are needed.',
  'اذا كان الطلب جاهزا سنرسله الى بريدك',
];

let pipeline: Pipeline;
let service: SpellService;

beforeAll(async () => {
  pipeline = await createPipeline({ customWords: CUSTOM });
  const handle = createHandler(loadRuntime, loadDictionary);
  let id = 0;
  service = createSpellService(
    {
      async request<C extends SpellCommand>(command: C) {
        const reply = await handle({ ...command, id: ++id } as SpellRequest);
        if (!reply.ok) throw new Error(reply.error);
        return reply.result as ResultByType[C['type']];
      },
    },
    { customWords: CUSTOM },
  );
  await vi.waitFor(() => expect(service.isReady('ar') && service.isReady('en')).toBe(true), { timeout: 20000 });
}, 30000);

describe('pipeline parity with the composer', () => {
  it.each(MESSAGES)('%s', async (message) => {
    const el = composer('');
    const hl = fakeHighlightEnv();
    const events: AssistEvent[] = [];
    const handle = attachSpellCheck(el, {
      service,
      mode: 'auto',
      debounceMs: 1,
      flashMs: 1,
      customWords: CUSTOM,
      onEvent: (e) => events.push(e),
      env: { highlights: hl.env, replace: textReplace(el), rectOf: () => new DOMRect(0, 0, 10, 10) },
    });
    typeChars(el, `${message} `);
    await handle.settled();
    await handle.recheck();
    const underlined = hl.words().sort();
    handle.detach();

    const { tokens, transient } = await pipeline.run(message);
    const replaced = events.filter((e) => e.type === 'autocorrect').map((e) => [e.original, e.replacement]);
    const expected = [...tokens.filter((t) => t.replacement), ...transient].sort((a, b) => a.start - b.start);
    expect(replaced).toEqual(expected.map((t) => [t.word, t.replacement]));
    // A transient replacement leaves the composer's text different from the
    // message, so underlines are only comparable without one.
    if (!transient.length) expect(underlined).toEqual(tokens.filter((t) => t.flagged && !t.replacement).map((t) => t.word).sort());
  });
});
