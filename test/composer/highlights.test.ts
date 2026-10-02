// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { acquireHighlights } from '../../src/composer/highlights';
import { fakeHighlightEnv } from './fakes';

const rangeOver = (text: string) => {
  const node = document.createTextNode(text);
  document.body.append(node);
  const r = document.createRange();
  r.selectNodeContents(node);
  return r;
};

beforeEach(() => document.head.replaceChildren());

describe('shared highlights', () => {
  it('lets two owners add and remove ranges independently', () => {
    const { env, ranges } = fakeHighlightEnv();
    const a = acquireHighlights(env);
    const b = acquireHighlights(env);
    const ra = rangeOver('one');
    const rb = rangeOver('two');
    a.setRanges([ra]);
    b.setRanges([rb]);
    expect(ranges()).toEqual([ra, rb]);
    a.setRanges([]);
    expect(ranges()).toEqual([rb]);
  });

  it('injects one style and removes it with the highlight after the last release', () => {
    const { env, registered } = fakeHighlightEnv();
    const a = acquireHighlights(env);
    const b = acquireHighlights(env);
    expect(document.querySelectorAll('style[data-bp-spell]')).toHaveLength(1);
    a.release();
    expect(registered.has('bp-spelling-error')).toBe(true);
    b.release();
    expect(registered.has('bp-spelling-error')).toBe(false);
    expect(document.querySelectorAll('style[data-bp-spell]')).toHaveLength(0);
  });
});

describe('named highlights', () => {
  it('keeps names separate and shares one ref-counted style element', () => {
    const { env, registered } = fakeHighlightEnv();
    const spelling = acquireHighlights(env, 'bp-spelling-error');
    const flash = acquireHighlights(env, 'bp-autocorrected');
    const r = rangeOver('word');
    flash.setRanges([r]);
    expect([...(registered.get('bp-autocorrected') ?? [])]).toEqual([r]);
    expect([...(registered.get('bp-spelling-error') ?? [])]).toEqual([]);
    expect(document.querySelectorAll('style[data-bp-spell]')).toHaveLength(1);
    expect(document.querySelector('style[data-bp-spell]')!.textContent).toContain('::highlight(bp-autocorrected)');
    spelling.release();
    expect(registered.has('bp-spelling-error')).toBe(false);
    expect(document.querySelectorAll('style[data-bp-spell]')).toHaveLength(1);
    flash.release();
    expect(registered.size).toBe(0);
    expect(document.querySelectorAll('style[data-bp-spell]')).toHaveLength(0);
  });
});
