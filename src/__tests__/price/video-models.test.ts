import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

<<<<<<< Updated upstream
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
=======
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

>>>>>>> Stashed changes
vi.mock('@/pricing/config/models.config', async () => {
  const original = await vi.importActual<typeof import('@/pricing/config/models.config')>('@/pricing/config/models.config');
  return {
    ...original,
    VIDEO_MODELS_CONFIG: {
<<<<<<< Updated upstream
      'model-a': { basePrice: 0.5, name: 'Model A (Mocked)' },
      'model-b': { basePrice: 1.0, name: 'Model B (Mocked)' },
      'model-c': { basePrice: 1.5, name: 'Model C (Mocked)' },
    },
=======
      'model-a': { basePrice: 0.5, name: 'Model A (Mocked)' }, // $0.50 fixed price
      'model-b': { basePrice: 1.0, name: 'Model B (Mocked)' }, // $1.00 fixed price
      'model-c': { basePrice: 1.5, name: 'Model C (Mocked)' }, // $1.50 fixed price
    },
    // Ensure other configs are present if needed by the calculator logic
>>>>>>> Stashed changes
    IMAGES_MODELS_CONFIG: original.IMAGES_MODELS_CONFIG ?? {},
    VOICE_MODELS_CONFIG: original.VOICE_MODELS_CONFIG ?? {},
    STEP_BASED_PRICES_USD: original.STEP_BASED_PRICES_USD ?? {},
  };
});

<<<<<<< Updated upstream
import { calculateFinalStarPrice } from '@/pricing/calculator'; // Adjusted path
=======
import { calculateFinalStarPrice } from '@/pricing/calculator';
>>>>>>> Stashed changes
import { ModeEnum } from '@/interfaces/modes';

describe('calculateFinalStarPrice for video models (fixed price per model)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

<<<<<<< Updated upstream
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
=======
  // Assuming TextToVideo uses modelId
  it('should calculate fixed price for TextToVideo based on model config', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToVideo, { modelId: 'model-a' });
    // base=0.5, markup=2 => finalUSD=1.0. stars=ceil((0.5/0.01)*2)=100. rub=1.0*100=100
    expect(result).toEqual({ stars: 100, rubles: 100, dollars: 1.0 });
  });

  // Assuming ImageToVideo uses modelId
  it('should calculate fixed price for ImageToVideo based on model config', () => {
    const result = calculateFinalStarPrice(ModeEnum.ImageToVideo, { modelId: 'model-b' });
    // base=1.0, markup=2 => finalUSD=2.0. stars=ceil((1.0/0.01)*2)=200. rub=2.0*100=200
    expect(result).toEqual({ stars: 200, rubles: 200, dollars: 2.0 });
  });

  // Example with another model
  it('should calculate fixed price for TextToVideo with another model', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToVideo, { modelId: 'model-c' });
    // base=1.5, markup=2 => finalUSD=3.0. stars=ceil((1.5/0.01)*2)=300. rub=3.0*100=300
    expect(result).toEqual({ stars: 300, rubles: 300, dollars: 3.0 });
  });

  // Test cases with seconds should now ignore seconds and return fixed price or 0 if model invalid
  it('should calculate fixed price for TextToVideo even if seconds provided', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToVideo, { modelId: 'model-a', seconds: 60 }); // seconds ignored
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
    // Re-import the original calculator function for subsequent tests if needed
=======
    // Re-import the original calculator function for subsequent tests if needed, though beforeEach handles reset
>>>>>>> Stashed changes
     await import('@/pricing/calculator');
  });
}); 