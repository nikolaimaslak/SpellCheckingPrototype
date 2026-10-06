import { describe, expect, it } from 'vitest';
import { buildUserContent, systemInstruction } from '../../server/prompt';

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

describe('instructions and Req 3.7', () => {
  it('forbids figures, dates, identifiers and names under the default', () => {
    const block = systemInstruction();
    for (const w of ['number', 'amount', 'date', 'time period', 'reference number', 'email', 'link', "person's name"]) expect(block, w).toContain(w);
    expect(block).not.toMatch(/exactly as written/);
  });

  it('with allow, limits figures to verbatim approved text and still forbids identifiers and names', () => {
    const allow = systemInstruction(true);
    expect(allow).toMatch(/only exactly as written in the approved responses or the knowledge base/);
    for (const w of ['reference numbers', 'email addresses', 'links', "person's name"]) expect(allow, w).toContain(w);
  });
});

describe('instructions and unfinished words', () => {
  it('explain how to continue an unfinished word, in both modes', () => {
    for (const allow of [false, true]) {
      expect(systemInstruction(allow)).toContain("If the agent's text ends in the middle of a word, start by writing that whole word; otherwise begin with a space.");
    }
  });
});

