// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { addMessage, readTranscript } from '../../src/demo/chat';
import { mountScenarios, SCENARIOS } from '../../src/demo/scenarios';

let transcript: HTMLElement;
let select: HTMLSelectElement;
let next: HTMLButtonElement;
let says: HTMLFormElement;

beforeEach(() => {
  document.body.innerHTML = `<select id="s"><option value="en-pension">en</option><option value="ar-pension">ar</option></select>
    <button id="n"></button><form id="f"><input name="text" /></form><ol id="t"></ol>`;
  transcript = document.getElementById('t')!;
  select = document.getElementById('s') as HTMLSelectElement;
  next = document.getElementById('n') as HTMLButtonElement;
  says = document.getElementById('f') as HTMLFormElement;
  mountScenarios(transcript, select, next, says);
});

describe('scripted customer conversation', () => {
  it('plays an Arabic scenario step as a labeled customer message with auto direction', () => {
    select.value = 'ar-pension';
    select.dispatchEvent(new Event('change'));
    next.click();
    const li = transcript.querySelector('li')!;
    expect(li.dataset.role).toBe('customer');
    expect(li.dataset.label).toBe('Customer');
    expect(li.dir).toBe('auto');
    expect(li.textContent).toBe(SCENARIOS['ar-pension'][0]);
  });

  it('accepts free text as a customer message', () => {
    (says.elements.namedItem('text') as HTMLInputElement).value = 'Is my request done?';
    says.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(readTranscript(transcript)).toEqual([{ role: 'customer', text: 'Is my request done?' }]);
  });

  it('reads turns in order with roles', () => {
    next.click();
    addMessage(transcript, 'agent', 'Let me check.');
    expect(readTranscript(transcript)).toEqual([
      { role: 'customer', text: SCENARIOS['en-pension'][0] },
      { role: 'agent', text: 'Let me check.' },
    ]);
  });

  it('disables "next" at the end of the scenario', () => {
    for (let i = 0; i < SCENARIOS['en-pension'].length; i++) next.click();
    expect(next.disabled).toBe(true);
  });
});
