import { vi, describe, it, expect, beforeEach } from 'vitest';
<<<<<<< Updated upstream
import { calculateFinalStarPrice } from '@/pricing/calculator'; // Adjusted path
import { ModeEnum } from '@/interfaces/modes';
=======
import { calculateFinalStarPrice } from '@/pricing/calculator';
import { ModeEnum } from '@/interfaces/modes';
// import * as pricingConfig from '@/pricing/config/pricing.config'; // No longer needed
>>>>>>> Stashed changes

// Моки конфигураций для Vitest
vi.mock('@/pricing/config/pricing.config', async () => {
  const original = await vi.importActual<typeof import('@/pricing/config/pricing.config')>('@/pricing/config/pricing.config');
  return {
    ...original,
<<<<<<< Updated upstream
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
=======
    STAR_COST_USD: 0.01, // $0.01 за звезду
    MARKUP_MULTIPLIER: 2, // Наценка x2
    BASE_PRICES_USD: {
        [ModeEnum.DigitalAvatarBody]: 0, // Base price is 0, depends on steps
        [ModeEnum.DigitalAvatarBodyV2]: 0, // Base price is 0, depends on steps
    },
    STEP_BASED_PRICES_USD: {
      [ModeEnum.DigitalAvatarBody]: 0.02, // $0.02 per step
      [ModeEnum.DigitalAvatarBodyV2]: 0.025, // $0.025 per step
    },
    CURRENCY_RATES: {
      USD_TO_RUB: 100, // 1 USD = 100 RUB
>>>>>>> Stashed changes
    },
  };
});

describe('calculateFinalStarPrice for step-based modes', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Use vi
  });

<<<<<<< Updated upstream
  // ... tests remain the same ...
  it('should calculate price for DigitalAvatarBody based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, { steps: 10 });
=======
  it('should calculate price for DigitalAvatarBody based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, { steps: 10 });
    // base=0.02*10=0.2, markup=2 => finalUSD=0.4. stars=ceil((0.2/0.01)*2)=40. rub=0.4*100=40
>>>>>>> Stashed changes
    expect(result).toEqual({ stars: 40, rubles: 40, dollars: 0.4 });
  });

  it('should calculate price for DigitalAvatarBodyV2 based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBodyV2, { steps: 10 });
<<<<<<< Updated upstream
=======
    // base=0.025*10=0.25, markup=2 => finalUSD=0.5. stars=ceil((0.25/0.01)*2)=50. rub=0.5*100=50
>>>>>>> Stashed changes
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