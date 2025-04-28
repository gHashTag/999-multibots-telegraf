<<<<<<< Updated upstream
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Move mock before imports
vi.mock('@/pricing/config/pricing.config', async () => {
    const original = await vi.importActual<typeof import('@/pricing/config/pricing.config')>('@/pricing/config/pricing.config');
=======
// import { vi, describe, it, expect, beforeEach } from 'vitest'; // Reverted

// Move mock before imports
jest.mock('@/pricing/config/pricing.config', () => { // Use jest
    const original = jest.requireActual('@/pricing/config/pricing.config'); // Use jest
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
// Mock models.config if needed (keep commented out for now)
// vi.mock('@/pricing/config/models.config', async () => {
//   const original = await vi.importActual<typeof import('@/pricing/config/models.config')>('@/pricing/config/models.config');
//   return {
//     ...original,
=======
// Mock models.config if needed for general tests (uncomment if necessary)
// jest.mock('@/pricing/config/models.config', () => {
//   const original = jest.requireActual('@/pricing/config/models.config');
//   return {
//     ...original,
//     // VIDEO_MODELS_CONFIG: { ... },
//     // IMAGES_MODELS_CONFIG: { ... },
//     // VOICE_MODELS_CONFIG: { ... },
>>>>>>> Stashed changes
//   };
// });

import { calculateFinalStarPrice } from '@/pricing/calculator'
import { ModeEnum } from '@/interfaces/modes'
<<<<<<< Updated upstream

describe('calculateFinalStarPrice - General Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
=======
// import * as pricingConfig from '@/pricing/config/pricing.config' // No longer needed here
// import * as modelsConfigModule from '@/pricing/config/models.config' // No longer needed here

// // Моки конфигураций для Jest - MOVED TO TOP
// vi.mock('@/pricing/config/pricing.config', () => {
//   const original = vi.requireActual('@/pricing/config/pricing.config')
//   return {
//     ...original,
//     STAR_COST_USD: 0.01, // $0.01 за звезду
//     MARKUP_MULTIPLIER: 2, // Наценка x2
//     BASE_PRICES_USD: {
//       [ModeEnum.NeuroPhoto]: 0.1, // $0.10 // Moved to fixed.test.ts
//       [ModeEnum.NeuroPhotoV2]: 0.15, // $0.15 (пример) // Moved to fixed.test.ts
//       [ModeEnum.DigitalAvatarBody]: 0, // Moved to steps.test.ts
//       [ModeEnum.ImageToVideo]: 0, // Moved to video-models.test.ts
//       [ModeEnum.TextToVideo]: 0, // Moved to video-models.test.ts
//       [ModeEnum.HelpScene]: 0, // Moved to fixed.test.ts
//       [ModeEnum.MainMenu]: 0, // Moved to fixed.test.ts
//       [ModeEnum.VoiceToText]: 0.05, // $0.05 // Moved to fixed.test.ts
//     },
//     STEP_BASED_PRICES_USD: {
//       [ModeEnum.DigitalAvatarBody]: 0.02, // $0.02 за шаг // Moved to steps.test.ts
//       [ModeEnum.DigitalAvatarBodyV2]: 0.025, // $0.025 за шаг (пример) // Moved to steps.test.ts
//     },
//     CURRENCY_RATES: {
//       USD_TO_RUB: 100, // 1 USD = 100 RUB
//     },
//   }
// })

// // Mock models.config for video models - MOVED TO TOP (or video-models.test.ts)
// vi.mock('@/pricing/config/models.config', () => {
//   const original = vi.requireActual('@/pricing/config/models.config');
//   return {
//     ...original,
//     VIDEO_MODELS_CONFIG: {
//       'suno/bark': { pricePerSecond: 0.001, name: 'VideoText (Mocked)' }, // $0.001/sec
//       'stability-ai/stable-video-diffusion': { pricePerSecond: 0.002, name: 'VideoTextV2 (Mocked)' }, // $0.002/sec
//       'another-model/v3': { pricePerSecond: 0.003, name: 'VideoTextV3 (Mocked)' }, // $0.003/sec
//     },
//     IMAGES_MODELS_CONFIG: original.IMAGES_MODELS_CONFIG,
//     VOICE_MODELS_CONFIG: original.VOICE_MODELS_CONFIG,
//   };
// });

describe('calculateFinalStarPrice - General Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Use jest
>>>>>>> Stashed changes
  });

  // --- Тесты для Общих Случаев ---
  it('should return 0 for unknown/unconfigured modes', () => {
    const result = calculateFinalStarPrice('unknown-mode' as ModeEnum);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

<<<<<<< Updated upstream
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
=======
  // --- Тесты для Базовых Цен (BASE_PRICES_USD) ---
  it('should calculate price for NeuroPhoto (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhoto);
    // base=0.1, markup=2 => finalUSD=0.2. stars=ceil((0.1/0.01)*2)=20. rub=0.2*100=20
    expect(result).toEqual({ stars: 20, rubles: 20, dollars: 0.2 });
  });

  it('should calculate price for NeuroPhotoV2 (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.NeuroPhotoV2);
    // base=0.15, markup=2 => finalUSD=0.3. stars=ceil((0.15/0.01)*2)=30. rub=0.3*100=30
    expect(result).toEqual({ stars: 30, rubles: 30, dollars: 0.3 });
  });

  it('should calculate price for VoiceToText (fixed price)', () => {
    const result = calculateFinalStarPrice(ModeEnum.VoiceToText);
    // base=0.05, markup=2 => finalUSD=0.1. stars=ceil((0.05/0.01)*2)=10. rub=0.1*100=10
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

  // --- Тесты для Цен по Шагам (STEP_BASED_PRICES_USD) ---
  it('should calculate price for DigitalAvatarBody based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, { steps: 10 });
    // base=0.02*10=0.2, markup=2 => finalUSD=0.4. stars=ceil((0.2/0.01)*2)=40. rub=0.4*100=40
    expect(result).toEqual({ stars: 40, rubles: 40, dollars: 0.4 });
  });

  it('should calculate price for DigitalAvatarBodyV2 based on steps', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBodyV2, { steps: 10 });
    // base=0.025*10=0.25, markup=2 => finalUSD=0.5. stars=ceil((0.25/0.01)*2)=50. rub=0.5*100=50
    expect(result).toEqual({ stars: 50, rubles: 50, dollars: 0.5 });
  });

  it('should return 0 for DigitalAvatarBody when steps = 0', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, { steps: 0 });
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  it('should return 0 for DigitalAvatarBody when steps is negative', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody, { steps: -5 });
    // Ожидаем 0, т.к. расчет цены будет 0 или отрицательный
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  it('should return 0 for DigitalAvatarBody when steps is not provided', () => {
    const result = calculateFinalStarPrice(ModeEnum.DigitalAvatarBody);
    // Базовая цена 0, шагов нет -> 0
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  // --- Тесты для Цен по Моделям Изображений (Пока НЕ реализовано в калькуляторе) ---
  it('should return 0 for TextToImage (as no logic exists yet)', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToImage);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  it('should return 0 for TextToImage even if modelId is provided (no logic yet)', () => {
    const result = calculateFinalStarPrice(ModeEnum.TextToImage, { modelId: 'some-image-model' });
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });

  // --- Тесты для Остальных Режимов (Ожидаем 0) ---
  // Removed test for TextToAudio as it's not in ModeEnum
  // it('should return 0 for unconfigured modes like TextToAudio', () => {
  //   const result = calculateFinalStarPrice(ModeEnum.TextToAudio);
  //   expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  // });

>>>>>>> Stashed changes
  it('should return 0 for unconfigured modes like ImageToPrompt', () => {
    const result = calculateFinalStarPrice(ModeEnum.ImageToPrompt);
    expect(result).toEqual({ stars: 0, rubles: 0, dollars: 0 });
  });
<<<<<<< Updated upstream
}); 
=======

  // TODO: Добавить тесты на граничные случаи и ошибки (если еще нужны)
  // TODO: Добавить тесты на приоритеты (если логика усложнится)
});
>>>>>>> Stashed changes
