// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { AUTOCORRECTED, createHighlight, SPELLING_ERROR } from '../../src/assistant/highlights';
import { fakeHighlightEnv } from './fakes';

const rangeOver = (text: string) => {
  const node = document.createTextNode(text);
  document.body.append(node);
  const r = document.createRange();
  r.selectNodeContents(node);
  return r;
};

describe('named highlights', () => {
  it('registers under its name and setRanges replaces what it paints', () => {
    const { env, ranges } = fakeHighlightEnv();
    const h = createHighlight(env, SPELLING_ERROR);
    const one = rangeOver('one');
    const two = rangeOver('two');
    h.setRanges([one]);
    expect(ranges()).toEqual([one]);
    h.setRanges([two]);
    expect(ranges()).toEqual([two]);
  });

  it('keeps names separate, and release clears and unregisters only its own', () => {
    const { env, registered } = fakeHighlightEnv();
    const spelling = createHighlight(env, SPELLING_ERROR);
    const flash = createHighlight(env, AUTOCORRECTED);
    const r = rangeOver('word');
    flash.setRanges([r]);
    expect([...(registered.get(AUTOCORRECTED) ?? [])]).toEqual([r]);
    expect([...(registered.get(SPELLING_ERROR) ?? [])]).toEqual([]);
    spelling.release();
    expect(registered.has(SPELLING_ERROR)).toBe(false);
    expect(registered.has(AUTOCORRECTED)).toBe(true);
    flash.release();
    expect(registered.size).toBe(0);
  });
});
