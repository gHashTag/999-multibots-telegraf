import { describe, test, expect, jest } from '@jest/globals';

// Mock BOT_TOKENS to a known set
jest.mock('@/core/bot', () => ({
  BOT_TOKENS: ['tok1', 'tok2', 'tok3'],
}));

import { getPhotoUrl } from '@/handlers/getPhotoUrl';

describe('getPhotoUrl unit tests', () => {
  const step = 4;
  test('returns URL for first token', () => {
    const url = getPhotoUrl({ telegram: { token: 'tok1' } } as any, step);
    expect(url).toContain('neuro_blogger_bot/levels/4.jpg');
  });
  test('returns URL for second token', () => {
    const url = getPhotoUrl({ telegram: { token: 'tok2' } } as any, step);
    expect(url).toContain('MetaMuse_Manifest_bot/levels/4.jpg');
  });
  test('returns URL for third token', () => {
    const url = getPhotoUrl({ telegram: { token: 'tok3' } } as any, step);
    expect(url).toContain('ZavaraBot/levels/4.jpg');
  });
  test('falls back to default for unknown token', () => {
    const url = getPhotoUrl({ telegram: { token: 'unknown' } } as any, step);
    expect(url).toContain('neuro_blogger_bot/levels/4.jpg');
  });
});
