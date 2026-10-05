import { describe, expect, it } from 'vitest';
import { selectModel, sourcedFigures } from '../../server/model-select';

describe('selectModel', () => {
  it('auto without a key uses the offline model', () => {
    expect(selectModel({})).toMatchObject({ mode: 'auto', external: false, model: { name: 'fake' } });
    expect(selectModel({ GEMINI_API_KEY: '  ' })).toMatchObject({ external: false, model: { name: 'fake' } });
  });

  it('auto with a key uses Gemini and reports external', () => {
    expect(selectModel({ GEMINI_API_KEY: 'k' })).toMatchObject({ mode: 'auto', external: true, model: { name: 'gemini-3.5-flash-lite' } });
  });

  it('gemini without a key is unavailable', () => {
    expect(selectModel({ COMPLETION_MODEL: 'gemini' })).toMatchObject({ mode: 'gemini', model: null, external: false });
  });

  it('fake ignores the key', () => {
    expect(selectModel({ COMPLETION_MODEL: 'fake', GEMINI_API_KEY: 'k' })).toMatchObject({ mode: 'fake', external: false, model: { name: 'fake' } });
  });

  it('an empty value means auto, without a warning', () => {
    expect(selectModel({ COMPLETION_MODEL: '' })).toMatchObject({ mode: 'auto', warning: undefined });
  });

  it('unknown values fall back to auto with a warning', () => {
    const s = selectModel({ COMPLETION_MODEL: 'gpt' });
    expect(s.mode).toBe('auto');
    expect(s.warning).toMatch(/unknown COMPLETION_MODEL/);
  });
});

describe('sourcedFigures', () => {
  it('is block unless COMPLETION_SOURCED_FIGURES is allow', () => {
    expect(sourcedFigures({})).toBe('block');
    expect(sourcedFigures({ COMPLETION_SOURCED_FIGURES: 'allow' })).toBe('allow');
    expect(sourcedFigures({ COMPLETION_SOURCED_FIGURES: ' Allow ' })).toBe('allow');
    expect(sourcedFigures({ COMPLETION_SOURCED_FIGURES: 'yes' })).toBe('block');
  });
});
