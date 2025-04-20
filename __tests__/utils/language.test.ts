import { describe, it, expect } from '@jest/globals';
import { isRussian } from '@/helpers/language';

describe('isRussian', () => {
  it('should return true for ru language_code', () => {
    const ctx: any = { from: { language_code: 'ru' } };
    expect(isRussian(ctx)).toBe(true);
  });

  it('should return false for non-ru language_code', () => {
    const ctx: any = { from: { language_code: 'en' } };
    expect(isRussian(ctx)).toBe(false);
  });

  it('should return false if from is undefined', () => {
    const ctx: any = {};
    expect(isRussian(ctx)).toBe(false);
  });
});