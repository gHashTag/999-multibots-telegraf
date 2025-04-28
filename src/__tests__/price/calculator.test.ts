import { vi, describe, it, expect, beforeEach } from 'vitest';

// Move mock before imports
vi.mock('@/pricing/config/pricing.config', async () => {
    const original = await vi.importActual<typeof import('@/pricing/config/pricing.config')>('@/pricing/config/pricing.config');
    return {
      ...original,
      STAR_COST_USD: 0.01,
      MARKUP_MULTIPLIER: 2,
      BASE_PRICES_USD: { /* Kept empty */ },
      STEP_BASED_PRICES_USD: { /* Kept empty */ },
      CURRENCY_RATES: {
        USD_TO_RUB: 100,
      },
    };
  });

// Mock models.config if needed (keep commented out for now)
// vi.mock('@/pricing/config/models.config', async () => {
//   const original = await vi.importActual<typeof import('@/pricing/config/models.config')>('@/pricing/config/models.config');
//   return {
//     ...original,
//   };
// });

import { calculateFinalStarPrice } from '@/pricing/calculator'
import { ModeEnum } from '@/interfaces/modes'

describe('calculateFinalStarPrice - General Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Тесты для Общих Случаев ---
  it('should return 0 for unknown/unconfigured modes', () => {
    const result = calculateFinalStarPrice('unknown-mode' as ModeEnum);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  // --- Тесты для Цен по Моделям Изображений (Пока НЕ реализовано) ---
  it('should return 0 for TextToImage (no logic yet)', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToImage);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  it('should return 0 for TextToImage even if modelId provided (no logic yet)', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToImage, { modelId: 'some-image-model' });
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  // --- Тесты для Остальных Режимов (Ожидаем 0) ---
  it('should return 0 for unconfigured modes like ImageToPrompt', () => {
    const result = calculateFinalStarPrice(ModeEnum.ImageToPrompt);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });
}); 