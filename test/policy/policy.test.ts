import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, parsePolicy, parsePreference, resolveMode, type AdminPolicy, type AssistMode } from '../../src/policy';

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
    const p: AdminPolicy = { mode: 'off', languages: ['en'], agentMayLower: false, customDictionary: ['Absher'] };
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
