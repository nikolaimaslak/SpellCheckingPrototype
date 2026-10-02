import { describe, expect, it } from 'vitest';
import { buildUserContent, SYSTEM_INSTRUCTION } from '../../server/prompt';

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
