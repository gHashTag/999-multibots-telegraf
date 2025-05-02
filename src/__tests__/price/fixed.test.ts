import { describe, it, expect, test, beforeEach } from 'bun:test'

// Move mock before imports to avoid temporal dead zone issues
// Mock path corrected and commented out as file does not exist
// vi.mock('@/config/pricing.config', async () => {
//     const original = await vi.importActual<typeof import('@/config/pricing.config')>('@/config/pricing.config');
//     return {
//       ...original,
//       STAR_COST_USD: 0.01,
//       MARKUP_MULTIPLIER: 2,
//       BASE_PRICES_USD: {
//         [ModeEnum.NeuroPhoto]: 0.1,
//         [ModeEnum.NeuroPhotoV2]: 0.15,
//         // [ModeEnum.HelpScene]: 0, // Removed as HelpScene not in ModeEnum
//         [ModeEnum.MainMenu]: 0,
//         [ModeEnum.VoiceToText]: 0.05,
//       },
//       STEP_BASED_PRICES_USD: {},
//       CURRENCY_RATES: {
//         USD_TO_RUB: 100,
//       },
//     };
//   });

// Assuming calculateFinalStarPrice can run without the mock for now
// TODO: Re-enable and adjust mock when pricing.config.ts is implemented
import { calculateFinalStarPrice } from '@/price/calculator' // Ensure correct path
import { ModeEnum } from '@/interfaces/modes'

describe('calculateFinalStarPrice for fixed price modes', () => {
  beforeEach(() => {
    // Mocks are automatically reset in bun test
  })

  // These tests now rely on the actual pricing.config.ts
  test('should calculate price for NeuroPhoto (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhoto)
    // Calculation based on actual pricing.config: base=0.1, cost=0.016, markup=1.5
    // finalStars = floor((0.1 / 0.016) * 1.5) = floor(9.375) = 9
    expect(result?.stars).toBe(9)
    expect(result?.rubles).toBeCloseTo(15)
    expect(result?.dollars).toBeCloseTo(0.15)
  })

  test('should calculate price for NeuroPhotoV2 (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhotoV2)
    // Calculation based on actual pricing.config: base=0.15, cost=0.016, markup=1.5
    // finalStars = floor((0.15 / 0.016) * 1.5) = floor(14.0625) = 14
    expect(result?.stars).toBe(14)
    expect(result?.rubles).toBeCloseTo(22.5)
    expect(result?.dollars).toBeCloseTo(0.225)
  })

  test('should calculate price for VoiceToText (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.VoiceToText)
    // Calculation based on actual pricing.config: base=0.05, cost=0.016, markup=1.5
    // finalStars = floor((0.05 / 0.016) * 1.5) = floor(4.6875) = 4
    expect(result?.stars).toBe(4)
    expect(result?.rubles).toBeCloseTo(7.5)
    expect(result?.dollars).toBeCloseTo(0.075)
  })

  // // Бесплатные режимы тоже имеют фиксированную цену 0 - Removed test for HelpScene
  // it('should return 0 for HelpScene (free mode)', () => {
  //  const result = calculateFinalStarPrice(ModeEnum.HelpScene);
  //  expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  // });

  test('should return 0 for MainMenu (free mode)', () => {
    const result = calculateFinalStarPrice(ModeEnum.MainMenu)
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 })
  })
})
