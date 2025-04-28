import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Move mock before imports
vi.mock('@/pricing/config/pricing.config', async () => {
    const original = await vi.importActual<typeof import('@/pricing/config/pricing.config')>('@/pricing/config/pricing.config');
    return {
      ...original,
      STAR_COST_USD: 0.01,
      MARKUP_MULTIPLIER: 2,
      BASE_PRICES_USD: { /* empty */ },
      CURRENCY_RATES: {
        USD_TO_RUB: 100,
      },
    };
  });

// Move mock before imports
vi.mock('@/pricing/config/models.config', async () => {
  const original = await vi.importActual<typeof import('@/pricing/config/models.config')>('@/pricing/config/models.config');
  return {
    ...original,
    VIDEO_MODELS_CONFIG: {
      'model-a': { basePrice: 0.5, name: 'Model A (Mocked)' },
      'model-b': { basePrice: 1.0, name: 'Model B (Mocked)' },
      'model-c': { basePrice: 1.5, name: 'Model C (Mocked)' },
    },
    IMAGES_MODELS_CONFIG: original.IMAGES_MODELS_CONFIG ?? {},
    VOICE_MODELS_CONFIG: original.VOICE_MODELS_CONFIG ?? {},
    STEP_BASED_PRICES_USD: original.STEP_BASED_PRICES_USD ?? {},
  };
});

import { calculateFinalStarPrice } from '@/pricing/calculator'; // Adjusted path
import { ModeEnum } from '@/interfaces/modes';

describe('calculateFinalStarPrice for video models (fixed price per model)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ... tests remain the same, using vi syntax indirectly via imported functions ...

  it('should calculate fixed price for TextToVideo based on model config', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToVideo, { modelId: 'model-a' });
    expect(result).toEqual({ stars: 100, rubles: 100, dollars: 1.0 });
  });

  it('should calculate fixed price for ImageToVideo based on model config', () => {
    const result = calculateFinalStarPrice(ModeEnum.ImageToVideo, { modelId: 'model-b' });
    expect(result).toEqual({ stars: 200, rubles: 200, dollars: 2.0 });
  });

  it('should calculate fixed price for TextToVideo with another model', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToVideo, { modelId: 'model-c' });
    expect(result).toEqual({ stars: 300, rubles: 300, dollars: 3.0 });
  });

  it('should calculate fixed price for TextToVideo even if seconds provided', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToVideo, { modelId: 'model-a', seconds: 60 });
    expect(result).toEqual({ stars: 100, rubles: 100, dollars: 1.0 });
  });

  it('should return 0 for TextToVideo if modelId is not provided', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToVideo);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  it('should return 0 for TextToVideo if modelId is not found in config', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToVideo, { modelId: 'non-existent-model' });
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  // Test edge case where model exists but has no valid basePrice
  it('should return 0 if model exists but basePrice is invalid', async () => {
    // Use vi.mock for temporary override
    vi.mock('@/pricing/config/models.config', async () => {
      const original = await vi.importActual<typeof import('@/pricing/config/models.config')>('@/pricing/config/models.config');
      return {
        ...original,
        VIDEO_MODELS_CONFIG: {
          'invalid-price-model': { name: 'Invalid Price Model' } // No basePrice
        }
      }
    });

    // Need to re-import the calculator function *after* the mock is applied for this test
    const { calculateFinalStarPrice: calcWithMock } = await import('@/pricing/calculator');
    const result = calcWithMock(ModeEnum.TextToVideo, { modelId: 'invalid-price-model' });
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });

    // Unmock to restore the original mock defined at the top level for other tests
    vi.unmock('@/pricing/config/models.config');

    // Re-import the original calculator function for subsequent tests if needed
     await import('@/pricing/calculator');
  });
}); 