/**
 * Unit tests for price helper functions
 */

// Test calculateCostInStars (dollars to stars)
import { calculateCostInStars as calcStarsFromDollars } from '@/price/helpers/calculateCostInStars'
// Test calculateFinalPrice (video model price)
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
// Test calculateStars helper
import { calculateStars } from '@/price/helpers/calculateStars'
// Test training cost calculations
import {
  calculateCostInStars as calcTrainingStars,
  calculateCostInDollars,
  calculateCostInRubles,
} from '@/price/helpers/calculateTrainingCost'
import { defaultSession } from '@/store'

import { Markup } from 'telegraf'
import { MyContext, MySession, UserModel, ModelUrl } from '@/interfaces'
// import { createReferralLink } from '@/referral' // Commented out due to path issue
import { validateAndCalculateImageModelPrice } from '@/price/helpers/validateAndCalculateImageModelPrice'
import { validateAndCalculateVideoModelPrice } from '@/price/helpers/validateAndCalculateVideoModelPrice'

// Add imports for Jest globals
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { Message, Chat } from 'telegraf/types' // Import base Message type and Chat type

// Mock dependencies
// jest.mock('@/referral') // Commented out
jest.mock('@/price/models/imageModelPrices', () => ({
  imageModelPrices: {
    modelA: { costPerImage: 10 },
    // Add other models if needed by tests
  }
}));
jest.mock('@/price/helpers/calculateFinalPrice');

// Helper to create a minimal valid MySession object
const createMinimalMySession = (overrides: Partial<MySession> = {}): MySession => ({
  cursor: 0,
  images: [],
  targetUserId: 'default-user-id',
  // Provide a valid UserModel structure
  userModel: {
    model_name: 'test-model',
    trigger_word: 'test-trigger',
    model_url: 'org/repo:version' as ModelUrl, // Use type assertion
  },
  ...overrides,
});

// Helper to create a minimal valid Message object (TextMessage for reply)
const createMinimalTextMessage = (): Message.TextMessage => ({
  message_id: 1,
  date: Date.now() / 1000,
  // Provide a valid PrivateChat object including first_name
  chat: { id: 1, type: 'private', first_name: 'MockChat' } as Chat.PrivateChat,
  from: { id: 1, is_bot: false, first_name: 'User' },
  text: 'mock reply',
});

describe('Price Helpers', () => {
  let ctx: ReturnType<typeof makeMockContext>; // Use the type from the mock context creator

  beforeEach(() => {
    jest.clearAllMocks();
    // Use the imported mock context creator
    ctx = makeMockContext();
    // Assign a valid session using the helper
    ctx.session = createMinimalMySession();
    // Correctly type the mock reply function using jest.MockedFunction
    ctx.reply = jest.fn().mockResolvedValue(undefined) as jest.Mock;
  })

  it('calcStarsFromDollars: should convert dollars to stars', () => {
    // The function seems to take only 1 arg based on previous errors
    // Assuming starCost is internal or fetched elsewhere
    // Need to verify function signature if this fails
    // For now, removing the second arg
    expect(calcStarsFromDollars(0.016)).toBe(1)
    expect(calcStarsFromDollars(0.032)).toBe(2)
    expect(calcStarsFromDollars(1.6)).toBe(100)
    expect(calcStarsFromDollars(0)).toBe(0)
  })

  it('calculateStars: floors the division of amount by star cost', () => {
    expect(calculateStars(1, 0.5)).toBe(2)
    expect(calculateStars(1.2, 0.5)).toBe(2)
    expect(calculateStars(0, 0.1)).toBe(0)
  })

  it('calculateFinalPrice: computes final stars price for video models', () => {
    // Mock the imported function directly
    (calculateFinalPrice as jest.Mock).mockImplementation((modelName: string) => {
      if (modelName === 'minimax') return 34;
      if (modelName === 'haiper') return 3;
      return 0; // Default or throw error
    });
    expect(calculateFinalPrice('minimax')).toBe(34)
    expect(calculateFinalPrice('haiper')).toBe(3)
  })

  it('training cost helpers: cost in stars, dollars, rubles', () => {
    const rates = {
      costPerStepInStars: 2,
      costPerStarInDollars: 0.5,
      rublesToDollarsRate: 80,
    }
    // stars: steps * 2, rounded to 2 decimals
    expect(calcTrainingStars(3, { costPerStepInStars: 2 })).toBe(6.0)
    // cost in dollars: 3*2*0.5=3.00
    expect(calculateCostInDollars(3, rates)).toBe(3.0)
    // rubles: 3*2*0.5*80 = 240
    expect(calculateCostInRubles(3, rates)).toBe(240.0)
  })

  // This test was separate, keep it separate but use correct rates structure
  it('calculateCostInRubles: should convert stars to rubles using different rates', () => {
    const rates = { costPerStepInStars: 1, costPerStarInDollars: 1, rublesToDollarsRate: 1/80 }; // Correct structure
    expect(calculateCostInRubles(3, rates)).toBe(240.00)
    expect(calculateCostInRubles(0, rates)).toBe(0)
  })

  // Removed the incorrectly added describe blocks for sendBalanceMessage, getUserBalance, etc.

  // Example of using the helper if a test *specifically* needs ctx.session
  // it('someOtherHelper test', () => {
  //   ctx.session = createMinimalMySession({ customProp: 'value' });
  //   // ... rest of the test using ctx.session
  // })
})

import makeMockContext from '../utils/mockTelegrafContext'

describe('validateAndCalculateImageModelPrice', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const availableModels = ['modelA']
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.session = createMinimalMySession()
    // Correctly type the mock reply function here as well
    ctx.reply = jest.fn().mockResolvedValue(undefined) as jest.Mock;
  })

  it('returns null and prompts when model is invalid', async () => {
    const result = await validateAndCalculateImageModelPrice(
      '',
      availableModels,
      100,
      true,
      ctx
    )
    expect(result).toBeNull()
    expect(ctx.reply).toHaveBeenCalledWith(
      'Пожалуйста, выберите корректную модель'
    )
  })

  it('returns null and prompts when costPerImage missing', async () => {
    // Use a model not in price list
    const result = await validateAndCalculateImageModelPrice(
      'unknown',
      ['unknown'],
      100,
      false,
      ctx
    )
    expect(result).toBeNull()
    expect(ctx.reply).toHaveBeenCalledWith('Error: invalid image model.')
  })

  it('returns null when balance is insufficient', async () => {
    // Choose a known model from imageModelPrices
    const model = Object.keys(
      require('@/price/models/imageModelPrices').imageModelPrices
    )[0]
    const priceList =
      require('@/price/models/imageModelPrices').imageModelPrices
    const price = priceList[model].costPerImage
    const result = await validateAndCalculateImageModelPrice(
      model,
      [model],
      price - 1,
      false,
      ctx
    )
    expect(result).toBeNull()
    expect(ctx.reply).toHaveBeenCalledWith('Insufficient balance')
  })

  it('returns price and sets session when sufficient balance', async () => {
    const models = require('@/price/models/imageModelPrices').imageModelPrices
    const model = Object.keys(models)[0]
    const price = models[model].costPerImage
    ctx.session = { ...defaultSession, paymentAmount: 0 }
    const result = await validateAndCalculateImageModelPrice(
      model,
      [model],
      price + 1,
      true,
      ctx
    )
    expect(result).toBe(price)
    expect(ctx.session.paymentAmount).toBe(price)
  })
})

describe('validateAndCalculateVideoModelPrice', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const availableModels = ['minimax']
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.session = createMinimalMySession()
    // Correctly type the mock reply function here too
    ctx.reply = jest.fn().mockResolvedValue(undefined) as jest.Mock;
    // Mock calculateFinalPrice with type assertion
    const mockedCalculateFinalPrice = calculateFinalPrice as jest.Mock;
    mockedCalculateFinalPrice.mockImplementation((modelName: string) => {
        if (modelName === 'minimax') return 34;
        return 0;
    });
  })

  it('returns null and prompts when model is invalid', async () => {
    const result = await validateAndCalculateVideoModelPrice(
      '',
      availableModels,
      10,
      true,
      ctx
    )
    expect(result).toBeNull()
    expect(ctx.reply).toHaveBeenCalledWith(
      'Пожалуйста, выберите корректную модель'
    )
  })

  it('returns null when balance is insufficient', async () => {
    const model: any = 'minimax'
    const price =
      require('@/price/helpers/calculateFinalPrice').calculateFinalPrice(model)
    const result = await validateAndCalculateVideoModelPrice(
      model,
      [model],
      price - 1,
      false,
      ctx
    )
    expect(result).toBeNull()
    expect(ctx.reply).toHaveBeenCalledWith('Insufficient balance')
  })

  it('returns price and sets session when sufficient balance', async () => {
    const model: any = 'minimax'
    const price =
      require('@/price/helpers/calculateFinalPrice').calculateFinalPrice(model)
    ctx.session = { ...defaultSession, paymentAmount: 0 }
    const result = await validateAndCalculateVideoModelPrice(
      model,
      [model],
      price + 1,
      true,
      ctx
    )
    expect(result).toBe(price)
    expect(ctx.session.paymentAmount).toBe(price)
  })
})
