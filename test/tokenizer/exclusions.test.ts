import { describe, expect, it } from 'vitest';
import { maskExclusions } from '../../src/tokenizer';

const kept = (text: string) => maskExclusions(text).split(/\s+/).filter(Boolean);

describe('maskExclusions', () => {
  it('preserves length so offsets stay valid', () => {
    const text = 'see https://gosi.gov.sa/ar or info@gosi.gov.sa, case CS-104233 $(user.firstName)';
    expect(maskExclusions(text)).toHaveLength(text.length);
  });

  it('masks URLs and emails', () => {
    expect(kept('see https://gosi.gov.sa/ar/services or mail info@gosi.gov.sa')).toEqual(['see', 'or', 'mail']);
    expect(kept('visit www.gosi.gov.sa today')).toEqual(['visit', 'today']);
  });

  it('masks whole runs containing Western or Arabic-Indic digits', () => {
    expect(kept('case CS-104233 and طلب ١٢٣٤٥')).toEqual(['case', 'and', 'طلب']);
    expect(kept('ref A12B, thanks')).toEqual(['ref', ',', 'thanks']);
  });

  it('masks substitution fields entirely', () => {
    expect(kept('Dear $(user.firstName), welcome')).toEqual(['Dear', ',', 'welcome']);
  });
});
