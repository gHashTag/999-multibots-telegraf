import { vi, describe, it, expect, beforeEach } from 'vitest';
import { calculateFinalStarPrice } from '@/pricing/calculator'; // Adjusted path
import { ModeEnum } from '@/interfaces/modes';

// Моки конфигураций для Vitest
vi.mock('@/pricing/config/pricing.config', async () => {
  const original = await vi.importActual<typeof import('@/pricing/config/pricing.config')>('@/pricing/config/pricing.config');
  return {
    ...original,
    STAR_COST_USD: 0.01,
    MARKUP_MULTIPLIER: 2,
    BASE_PRICES_USD: {
        [ModeEnum.DigitalAvatarBody]: 0,
        [ModeEnum.DigitalAvatarBodyV2]: 0,
    },
    STEP_BASED_PRICES_USD: {
      [ModeEnum.DigitalAvatarBody]: 0.02,
      [ModeEnum.DigitalAvatarBodyV2]: 0.025,
    },
    CURRENCY_RATES: {
      USD_TO_RUB: 100,
    },
  };
});

describe('calculateFinalStarPrice for step-based modes', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Use vi
  });

  // ... tests remain the same ...
  it('should calculate price for DigitalAvatarBody based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, { steps: 10 });
    expect(result).toEqual({ stars: 40, rubles: 40, dollars: 0.4 });
  });

  it('should calculate price for DigitalAvatarBodyV2 based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBodyV2, { steps: 10 });
    expect(result).toEqual({ stars: 50, rubles: 50, dollars: 0.5 });
  });

  it('should return 0 for DigitalAvatarBody when steps = 0', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, { steps: 0 });
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  it('should return 0 for DigitalAvatarBody when steps is negative', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, { steps: -5 });
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  it('should return 0 for DigitalAvatarBody when steps is not provided', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });
}); 