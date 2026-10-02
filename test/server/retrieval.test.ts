import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize, retrieve } from '../../server/retrieval';
import type { CannedResponse } from '../../server/types';

const library = (JSON.parse(readFileSync('server/data/canned.json', 'utf8')) as { responses: CannedResponse[] }).responses;

describe('retrieval', () => {
  it('ranks the matching English response first', () => {
    const top = retrieve(library, 'Can you check the status of my contribution records?', 'Your contribution');
    expect(top[0].id).toBe('en-contrib-status');
  });

  it('matches Arabic despite hamza and article differences', () => {
    const top = retrieve(library, 'استعلام عن الاشتراكات', '');
    expect(top.map((r) => r.id)).toContain('ar-contrib-status');
    // "الإشتراك" in the pension entry is spelled with hamza
    expect(normalize('الإشتراك')).toBe(normalize('الاشتراك'));
  });

  it('returns nothing for an unrelated query', () => {
    expect(retrieve(library, 'what is the weather in Paris', '')).toEqual([]);
  });

  it('returns at most three', () => {
    expect(retrieve(library, 'request documents contribution pension account', 'your request').length).toBeLessThanOrEqual(3);
  });

  it('library is labeled synthetic', () => {
    expect(JSON.parse(readFileSync('server/data/canned.json', 'utf8'))._note).toMatch(/SYNTHETIC/);
  });
});
