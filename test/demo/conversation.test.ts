// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTranscript } from '../../src/demo/chat';
import { mountConversationLoader, parseChat, turnCannedOff, type Turn } from '../../src/demo/conversation';

const fixture = JSON.parse(readFileSync('test/fixtures/chat-format.json', 'utf8')) as {
  entries: { name: string; text: string; conversations: Turn[][]; warnings: string[] }[];
};

describe('parseChat (shared fixture with server/assist_eval/sources.py)', () => {
  it.each(fixture.entries.map((e) => [e.name, e] as const))('%s', (_name, e) => {
    expect(parseChat(e.text)).toEqual({ conversations: e.conversations, warnings: e.warnings });
  });
});

const LOADER = `
  <form id="assist-settings">
    <input type="checkbox" name="sourceTranscript" checked />
    <input type="checkbox" name="sourceCanned" checked />
    <input type="checkbox" name="sourceKb" checked />
  </form>
  <details id="load-conversation" open>
    <summary>Load conversation…</summary>
    <textarea name="conversation"></textarea>
    <input type="file" />
    <select name="which" hidden></select>
    <select name="upTo"></select>
    <button type="button" data-load disabled>Load</button>
    <output></output>
  </details>
  <ol id="chat-transcript"></ol>
  <div id="chat-composer" contenteditable="true"></div>`;

const EN = 'Customer: c1\nAgent: a1\nCustomer: c2\nAgent: a2\n';

describe('mountConversationLoader', () => {
  let applied: number;
  const el = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  const transcript = () => el<HTMLOListElement>('#chat-transcript');
  const paste = (text: string) => {
    const area = el<HTMLTextAreaElement>('textarea');
    area.value = text;
    area.dispatchEvent(new Event('change'));
  };
  const load = () => el<HTMLButtonElement>('[data-load]').click();
  const shown = () => readTranscript(transcript()).map((t) => `${t.role}:${t.text}`);

  beforeEach(() => {
    document.body.innerHTML = LOADER;
    applied = 0;
    const settings = el<HTMLFormElement>('#assist-settings');
    settings.addEventListener('submit', (e) => (e.preventDefault(), applied++));
    mountConversationLoader(el('#load-conversation'), transcript(), { onLoaded: () => turnCannedOff(settings) });
  });
  afterEach(() => vi.restoreAllMocks());

  it('loads an English conversation up to agent message 2 (the default: before the last)', () => {
    paste(EN);
    expect(el<HTMLSelectElement>('select[name="upTo"]').value).toBe('2');
    expect([...el<HTMLSelectElement>('select[name="upTo"]').options].map((o) => o.textContent)).toEqual([
      'Before agent message 1: “a1”',
      'Before agent message 2: “a2”',
      'Whole conversation',
    ]);
    load();
    expect(shown()).toEqual(['customer:c1', 'agent:a1', 'customer:c2']);
    expect(el<HTMLDetailsElement>('#load-conversation').open).toBe(false);
    expect(document.activeElement).toBe(el('#chat-composer'));
  });

  it('loads before agent message 1', () => {
    paste(EN);
    el<HTMLSelectElement>('select[name="upTo"]').value = '1';
    load();
    expect(shown()).toEqual(['customer:c1']);
  });

  it('loads an Arabic conversation with automatic direction and role labels', () => {
    paste('العميل: متى سيتم معالجة طلبي؟\nالموظف: شكراً لانتظارك، تم استلام طلبك.\n');
    el<HTMLSelectElement>('select[name="upTo"]').value = 'all';
    load();
    const items = [...transcript().querySelectorAll('li')];
    expect(items.map((li) => [li.dataset.role, li.dataset.label, li.dir])).toEqual([
      ['customer', 'Customer', 'auto'],
      ['agent', 'Agent', 'auto'],
    ]);
  });

  it('keeps a mixed continued line in its agent turn', () => {
    paste('Customer: hi\nAgent: أهلاً، سأساعدك في your Absher account\nوسأرسل لك رابط الـ reset.\n');
    el<HTMLSelectElement>('select[name="upTo"]').value = 'all';
    load();
    expect(readTranscript(transcript())[1].text).toBe('أهلاً، سأساعدك في your Absher account\nوسأرسل لك رابط الـ reset.');
  });

  it('chooses among conversations', () => {
    paste('Customer: first one here\nAgent: a\n---\nCustomer: second one here\nAgent: b\n');
    const which = el<HTMLSelectElement>('select[name="which"]');
    expect(which.hidden).toBe(false);
    expect([...which.options].map((o) => o.textContent)).toEqual(['1 · first one here', '2 · second one here']);
    which.value = '1';
    which.dispatchEvent(new Event('change'));
    el<HTMLSelectElement>('select[name="upTo"]').value = 'all';
    load();
    expect(shown()).toEqual(['customer:second one here', 'agent:b']);
  });

  it('loads the whole conversation, and replaces what was there', () => {
    transcript().append(Object.assign(document.createElement('li'), { textContent: 'old' }));
    paste(EN);
    el<HTMLSelectElement>('select[name="upTo"]').value = 'all';
    load();
    expect(shown()).toEqual(['customer:c1', 'agent:a1', 'customer:c2', 'agent:a2']);
  });

  it('turns canned responses off and applies the settings, leaving the knowledge base', () => {
    paste(EN);
    load();
    const form = el<HTMLFormElement>('#assist-settings');
    expect(form.querySelector<HTMLInputElement>('[name="sourceCanned"]')!.checked).toBe(false);
    expect(form.querySelector<HTMLInputElement>('[name="sourceKb"]')!.checked).toBe(true);
    expect(form.querySelector<HTMLInputElement>('[name="sourceTranscript"]')!.checked).toBe(true);
    expect(applied).toBe(1);
    expect(el<HTMLOutputElement>('output').value).toMatch(/Canned responses turned off/);
    // Already off: nothing to apply again.
    load();
    expect(applied).toBe(1);
  });

  it('reads a picked file in the page, with no network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as never);
    const input = el<HTMLInputElement>('input[type="file"]');
    const file = new File([EN], 'chat.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(el<HTMLTextAreaElement>('textarea').value).toBe(EN));
    load();
    expect(shown()).toEqual(['customer:c1', 'agent:a1', 'customer:c2']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a file over 1 MB', async () => {
    const input = el<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [new File(['x'.repeat(1024 * 1024 + 1)], 'big.txt')] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(el<HTMLOutputElement>('output').value).toMatch(/larger than 1 MB/));
    expect(el<HTMLTextAreaElement>('textarea').value).toBe('');
  });

  it('shows a message for text without labeled turns and leaves the transcript', () => {
    transcript().append(Object.assign(document.createElement('li'), { textContent: 'kept' }));
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    paste('Just some text\nwithout any role label.');
    expect(el<HTMLButtonElement>('[data-load]').disabled).toBe(true);
    expect(el<HTMLOutputElement>('output').value).toMatch(/No Customer: or Agent: turns found · 2 line\(s\) skipped: line 1, line 2/);
    load();
    expect(transcript().textContent).toBe('kept');
    expect(alert).not.toHaveBeenCalled();
  });

  it('parses pasted text after a pause in typing', async () => {
    vi.useFakeTimers();
    const area = el<HTMLTextAreaElement>('textarea');
    area.value = EN;
    area.dispatchEvent(new Event('input'));
    expect(el<HTMLButtonElement>('[data-load]').disabled).toBe(true);
    vi.advanceTimersByTime(150);
    expect(el<HTMLButtonElement>('[data-load]').disabled).toBe(false);
    vi.useRealTimers();
  });
});
