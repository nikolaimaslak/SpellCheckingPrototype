import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, parsePolicy, parsePreference, resolveCompletion, resolveMode, type AdminPolicy, type AssistMode } from '../../src/policy';

const policy = (mode: AssistMode, agentMayLower: boolean): AdminPolicy => ({ ...DEFAULT_POLICY, mode, agentMayLower });

describe('resolveMode', () => {
  const cases: [AssistMode, boolean, AssistMode | undefined, AssistMode][] = [
    ['auto', true, 'suggest', 'suggest'], // agent lowers
    ['auto', true, 'off', 'off'],
    ['auto', true, 'auto', 'auto'],
    ['suggest', true, 'auto', 'suggest'], // can't raise
    ['suggest', true, 'off', 'off'],
    ['off', true, 'auto', 'off'], // admin off stays off
    ['off', true, 'suggest', 'off'],
    ['auto', false, 'off', 'auto'], // choice not allowed
    ['auto', false, 'suggest', 'auto'],
    ['suggest', false, undefined, 'suggest'],
    ['auto', true, undefined, 'auto'],
  ];
  it.each(cases)('admin %s (agent may lower: %s) + agent %s → %s', (admin, may, pref, expected) => {
    expect(resolveMode(policy(admin, may), { mode: pref })).toBe(expected);
  });
});

describe('parsePolicy', () => {
  it('defaults to suggest for garbage', () => {
    for (const bad of [null, undefined, 42, 'auto', [], { mode: 'aggressive' }]) {
      expect(parsePolicy(bad)).toEqual(DEFAULT_POLICY);
    }
  });

  it('keeps valid fields and defaults the rest', () => {
    expect(parsePolicy({ mode: 'auto', languages: ['ar', 'fr'] })).toEqual({
      ...DEFAULT_POLICY,
      mode: 'auto',
      languages: ['ar'],
    });
  });

  it('cleans the custom dictionary', () => {
    expect(parsePolicy({ customDictionary: [' GOSI ', 'GOSI', '', 7, 'التأمينات'] }).customDictionary).toEqual(['GOSI', 'التأمينات']);
  });

  it('round-trips a valid policy', () => {
    const p: AdminPolicy = { mode: 'off', languages: ['en'], agentMayLower: false, customDictionary: ['Absher'], completion: { enabled: 'listed', teams: ['Pensions'], users: [], sources: { transcript: true, canned: false } } };
    expect(parsePolicy(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});

describe('parsePreference', () => {
  it('accepts a valid mode only', () => {
    expect(parsePreference({ mode: 'suggest' })).toEqual({ mode: 'suggest' });
    expect(parsePreference({ mode: 'x' })).toEqual({});
    expect(parsePreference(null)).toEqual({});
  });
});

describe('resolveCompletion', () => {
  const agent = { user: 'agent.42', team: 'Pensions' };
  const withCompletion = (enabled: 'off' | 'all' | 'listed', extra: Partial<AdminPolicy['completion']> = {}, agentMayLower = true): AdminPolicy => ({
    ...DEFAULT_POLICY,
    agentMayLower,
    completion: { ...DEFAULT_POLICY.completion, enabled, ...extra },
  });

  it('is off by default', () => {
    expect(resolveCompletion(DEFAULT_POLICY, {}, agent)).toBe(false);
  });

  it('all enables everyone', () => {
    expect(resolveCompletion(withCompletion('all'), {}, agent)).toBe(true);
  });

  it('listed enables by team or by user only', () => {
    expect(resolveCompletion(withCompletion('listed', { teams: ['Pensions'] }), {}, agent)).toBe(true);
    expect(resolveCompletion(withCompletion('listed', { teams: ['Pensions'] }), {}, { user: 'x', team: 'Registration' })).toBe(false);
    expect(resolveCompletion(withCompletion('listed', { users: ['agent.42'] }), {}, { user: 'agent.42', team: 'Registration' })).toBe(true);
    expect(resolveCompletion(withCompletion('listed'), {}, agent)).toBe(false);
  });

  it('agent can turn it off only when choice is allowed, and can never turn it on', () => {
    expect(resolveCompletion(withCompletion('all'), { completion: false }, agent)).toBe(false);
    expect(resolveCompletion(withCompletion('all', {}, false), { completion: false }, agent)).toBe(true);
    expect(resolveCompletion(withCompletion('off'), { completion: true }, agent)).toBe(false);
  });
});

describe('parsePolicy completion', () => {
  it('fills completion defaults for stored Phase 2 settings', () => {
    const phase2 = { mode: 'auto', languages: ['en'], agentMayLower: false, customDictionary: ['GOSI'] };
    expect(parsePolicy(phase2).completion).toEqual(DEFAULT_POLICY.completion);
  });

  it('keeps valid completion fields and defaults the rest', () => {
    expect(parsePolicy({ completion: { enabled: 'listed', teams: [' Pensions ', 7], sources: { canned: false } } }).completion).toEqual({
      enabled: 'listed',
      teams: ['Pensions'],
      users: [],
      sources: { transcript: true, canned: false },
    });
  });

  it('parses the agent completion preference', () => {
    expect(parsePreference({ mode: 'suggest', completion: false })).toEqual({ mode: 'suggest', completion: false });
  });
});
