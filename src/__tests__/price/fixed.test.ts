import { vi, describe, it, expect, beforeEach } from 'vitest';

// Move mock before imports to avoid temporal dead zone issues
vi.mock('@/pricing/config/pricing.config', async () => {
    const original = await vi.importActual<typeof import('@/pricing/config/pricing.config')>('@/pricing/config/pricing.config');
    return {
      ...original,
      STAR_COST_USD: 0.01,
      MARKUP_MULTIPLIER: 2,
      BASE_PRICES_USD: {
        // Use string keys as Vitest mocks might have similar issues
        'NeuroPhoto': 0.1,
        'NeuroPhotoV2': 0.15,
        'DigitalAvatarBody': 0,
        'ImageToVideo': 0,
        'TextToVideo': 0,
        'HelpScene': 0,
        'MainMenu': 0,
        'VoiceToText': 0.05,
      },
      STEP_BASED_PRICES_USD: {},
      CURRENCY_RATES: {
        USD_TO_RUB: 100,
      },
    };
  });

import { calculateFinalStarPrice } from '@/pricing/calculator'; // Adjusted path
import { ModeEnum } from '@/interfaces/modes';

describe('calculateFinalStarPrice for fixed price modes', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Use vi
  });

  it('should calculate price for NeuroPhoto (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhoto);
    expect(result).toEqual({ stars: 20, rubles: 20, dollars: 0.2 });
  });

  it('should calculate price for NeuroPhotoV2 (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhotoV2);
    expect(result).toEqual({ stars: 30, rubles: 30, dollars: 0.3 });
  });

  it('should calculate price for VoiceToText (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.VoiceToText);
    expect(result).toEqual({ stars: 10, rubles: 10, dollars: 0.1 });
  });

   it('should return 0 for HelpScene (free mode)', () => {
    const result = calculateFinalStarPrice(ModeEnum.HelpScene);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  it('should return 0 for MainMenu (free mode)', () => {
    const result = calculateFinalStarPrice(ModeEnum.MainMenu);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

}); 