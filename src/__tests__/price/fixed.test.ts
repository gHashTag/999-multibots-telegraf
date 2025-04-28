import { vi, describe, it, expect, beforeEach } from 'vitest';

// Move mock before imports to avoid temporal dead zone issues
vi.mock('@/pricing/config/pricing.config', async () => {
    const original = await vi.importActual<typeof import('@/pricing/config/pricing.config')>('@/pricing/config/pricing.config');
    return {
      ...original,
      STAR_COST_USD: 0.01,
      MARKUP_MULTIPLIER: 2,
      BASE_PRICES_USD: {
<<<<<<< Updated upstream
        // Use string keys as Vitest mocks might have similar issues
=======
        // Use string keys as before, safer with Jest mocks too
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
import { calculateFinalStarPrice } from '@/pricing/calculator'; // Adjusted path
import { ModeEnum } from '@/interfaces/modes';
=======
import { calculateFinalStarPrice } from '@/pricing/calculator';
import { ModeEnum } from '@/interfaces/modes';
// import * as pricingConfig from '@/pricing/config/pricing.config'; // No longer needed here

// // Моки конфигураций для Jest (только pricing.config, т.к. models.config не нужен здесь)
// jest.mock('@/pricing/config/pricing.config', () => {
//   const original = jest.requireActual('@/pricing/config/pricing.config');
//   return {
//     ...original,
//     STAR_COST_USD: 0.01, // $0.01 за звезду
//     MARKUP_MULTIPLIER: 2, // Наценка x2
//     BASE_PRICES_USD: {
//       [ModeEnum.NeuroPhoto]: 0.1, // $0.10
//       [ModeEnum.NeuroPhotoV2]: 0.15, // $0.15 (пример)
//       [ModeEnum.DigitalAvatarBody]: 0,
//       [ModeEnum.ImageToVideo]: 0,
//       [ModeEnum.TextToVideo]: 0,
//       [ModeEnum.HelpScene]: 0,
//       [ModeEnum.MainMenu]: 0,
//       [ModeEnum.VoiceToText]: 0.05, // $0.05
//     },
//     STEP_BASED_PRICES_USD: { // Оставим пустым или удалим, если не нужно
//         // [ModeEnum.DigitalAvatarBody]: 0.02,
//     },
//     CURRENCY_RATES: {
//       USD_TO_RUB: 100, // 1 USD = 100 RUB
//     },
//   };
// });

>>>>>>> Stashed changes

describe('calculateFinalStarPrice for fixed price modes', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Use vi
  });

  it('should calculate price for NeuroPhoto (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhoto);
<<<<<<< Updated upstream
=======
    // base=0.1, markup=2 => finalUSD=0.2. stars=ceil((0.1/0.01)*2)=20. rub=0.2*100=20
>>>>>>> Stashed changes
    expect(result).toEqual({ stars: 20, rubles: 20, dollars: 0.2 });
  });

  it('should calculate price for NeuroPhotoV2 (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhotoV2);
<<<<<<< Updated upstream
=======
    // base=0.15, markup=2 => finalUSD=0.3. stars=ceil((0.15/0.01)*2)=30. rub=0.3*100=30
>>>>>>> Stashed changes
    expect(result).toEqual({ stars: 30, rubles: 30, dollars: 0.3 });
  });

  it('should calculate price for VoiceToText (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.VoiceToText);
<<<<<<< Updated upstream
    expect(result).toEqual({ stars: 10, rubles: 10, dollars: 0.1 });
  });

=======
    // base=0.05, markup=2 => finalUSD=0.1. stars=ceil((0.05/0.01)*2)=10. rub=0.1*100=10
    expect(result).toEqual({ stars: 10, rubles: 10, dollars: 0.1 });
  });

  // Бесплатные режимы тоже имеют фиксированную цену 0
>>>>>>> Stashed changes
   it('should return 0 for HelpScene (free mode)', () => {
    const result = calculateFinalStarPrice(ModeEnum.HelpScene);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  it('should return 0 for MainMenu (free mode)', () => {
    const result = calculateFinalStarPrice(ModeEnum.MainMenu);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

}); 