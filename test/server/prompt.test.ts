import { describe, expect, it } from 'vitest';
import { buildUserContent, COMPLETION_SCHEMA, systemInstruction } from '../../server/prompt';

const SYSTEM_INSTRUCTION = systemInstruction();

const transcript = [
  { role: 'customer' as const, text: 'I want to know my contribution status' },
  { role: 'agent' as const, text: 'Sure, one moment.' },
];
const canned = [{ id: 'en-contrib-status', lang: 'en' as const, text: 'Your contribution records are up to date.' }];

describe('prompt', () => {
  it('orders approved responses, then conversation, then the prefix last', () => {
    const user = buildUserContent('Your contribution', transcript, canned);
    const a = user.indexOf('Approved responses:');
    const c = user.indexOf('Conversation:');
    const p = user.indexOf('Agent is typing:\nYour contribution');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(c);
    expect(c).toBeLessThan(p);
    expect(user.endsWith('Your contribution')).toBe(true);
  });

  it('omits disabled sources', () => {
    const user = buildUserContent('Your contribution', null, null);
    expect(user).not.toContain('Approved responses');
    expect(user).not.toContain('Conversation');
  });

  it('keeps only the last 6 turns', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ role: 'customer' as const, text: `turn ${i}` }));
    const user = buildUserContent('x', many, null);
    expect(user).not.toContain('turn 2');
    expect(user).toContain('turn 3');
  });

  it('instructs one sentence in the same language', () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/one sentence/);
    expect(SYSTEM_INSTRUCTION).toMatch(/same language/);
  });
});

describe('prompt with knowledge base', () => {
  it('places knowledge base passages after approved responses and before the conversation', () => {
    const kb = [{ id: 'kb:x#0', text: 'Early retirement eligibility: available after 25 years.' }];
    const user = buildUserContent('You are', transcript, canned, kb);
    const a = user.indexOf('Approved responses:');
    const k = user.indexOf('Knowledge base:');
    const c = user.indexOf('Conversation:');
    expect(a).toBeLessThan(k);
    expect(k).toBeLessThan(c);
    expect(user.endsWith('You are')).toBe(true);
  });

  it('tells the model not to invent facts beyond the provided sources', () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/knowledge base/);
  });
});

describe('instructions and details from the sources', () => {
  it('no longer forbid details, and ask for them only as given in the sources', () => {
    const s = systemInstruction();
    expect(s).not.toMatch(/Do not include any number/);
    expect(s).not.toMatch(/only exactly as written/);
    expect(s).toContain('Use names, numbers, amounts, dates, time periods, reference numbers, email addresses and links only as they appear in the conversation, the approved responses or the knowledge base; never invent them.');
    expect(s).toContain('Do not invent policies that are not in the approved responses, the knowledge base or the conversation.');
  });
});

describe('instructions and unfinished words', () => {
  it('ask for the whole current word in `word` and the continuation in `rest`', () => {
    const s = systemInstruction();
    expect(s).toMatch(/Return JSON with two fields\. `word`: the last word of the agent's text, written out in full, whether or not the agent finished it/);
    expect(s).toContain('"Ollama" when the text ends with "Ollam", and "request" when it ends with "request"');
    expect(s).toMatch(/`rest`: the continuation after that word/);
    expect(s).not.toContain('begin with the rest of that word');
    expect(s).not.toContain('start by writing that whole word');
  });

  it('exports the response schema of word and rest', () => {
    expect(COMPLETION_SCHEMA).toEqual({ type: 'OBJECT', properties: { word: { type: 'STRING' }, rest: { type: 'STRING' } }, required: ['word', 'rest'] });
  });
});

