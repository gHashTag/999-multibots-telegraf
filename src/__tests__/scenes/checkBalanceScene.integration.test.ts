import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, Scenes, Markup } from 'telegraf'
// import dotenv from 'dotenv'; // Убираем dotenv отсюда
// dotenv.config({ path: '.env.test' }); // Убираем dotenv отсюда

import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { PaymentType } from '@/interfaces/payments.interface'
import { checkBalanceScene } from '@/scenes/checkBalanceScene' // The scene to test
import {
  getUserDetailsSubscription,
  updateUserBalance,
  getUserBalance,
  invalidateBalanceCache,
} from '@/core/supabase'
import * as priceCalculator from '@/price/calculator' // To mock price calculation
import * as priceHelpers from '@/price/helpers' // To mock message sending
import { getUserInfo } from '@/handlers/getUserInfo'
import { User } from '@/interfaces/user.interface'

// Mock Telegraf context and session
const createMockContext = (
  sessionData: Partial<MyContext['session']> = {},
  fromData: Partial<MyContext['from']> = {}
): MyContext => {
  const ctx = {
    session: { mode: ModeEnum.MainMenu, ...sessionData }, // Default session
    from: {
      id: 123456,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser',
      language_code: 'en',
      ...fromData,
    },
    botInfo: { username: 'test_bot' },
    scene: {
      enter: vi.fn(),
      leave: vi.fn(),
      state: {}, // Initialize scene state
    },
    reply: vi.fn(),
    // Add other methods if needed by the scene
  } as unknown as MyContext // Use type assertion carefully
  return ctx
}

// Возвращаем мок модуля, но с простой фабрикой
vi.mock('@/core/supabase', () => ({
  getUserDetailsSubscription: vi.fn(),
  updateUserBalance: vi.fn(),
  getUserBalance: vi.fn(),
  invalidateBalanceCache: vi.fn(),
  // Не мокируем все подряд, только то, что используется в тестах
}))

// Mock price calculation
vi.mock('@/price/calculator', async () => {
  const original =
    await vi.importActual<typeof import('@/price/calculator')>(
      '@/price/calculator'
    )
  return {
    ...original,
    calculateFinalStarPrice: vi.fn(),
  }
})

// Mock price helpers (message sending)
vi.mock('@/price/helpers', async () => {
  const original =
    await vi.importActual<typeof import('@/price/helpers')>('@/price/helpers')
  return {
    ...original,
    sendBalanceMessage: vi.fn(),
    sendInsufficientStarsMessage: vi.fn(),
  }
})

// Mock dependencies
vi.mock('@/handlers/getUserInfo')

// НЕ МОКИРУЕМ САМУ СЦЕНУ, ТАК КАК ТЕСТИРУЕМ ЕЕ ENTER
// vi.mock('@/scenes/checkBalanceScene', async (importOriginal) => {
//   const original = await importOriginal<typeof import('@/scenes/checkBalanceScene')>();
//   return {
//     ...original, // Keep original exports like the scene object itself
//     // Mock specific functions if needed, e.g., enterTargetScene
//     enterTargetScene: vi.fn().mockResolvedValue(undefined),
//      // checkBalanceAndEnterScene: vi.fn().mockResolvedValue(undefined), // Keep original if not mocking
//   };
// });

const mockUserInfo = {
  userId: 1,
  telegramId: '123456',
}

vi.mock('@/handlers/getUserInfo', () => ({
  getUserInfo: vi.fn().mockReturnValue(mockUserInfo),
}))

describe('checkBalanceScene - Integration Tests', () => {
  let ctx: MyContext

  beforeEach(() => {
    vi.clearAllMocks() // Clear mocks before each test

    // Используем vi.mocked() с индивидуально импортированными функциями
    vi.mocked(getUserDetailsSubscription).mockResolvedValue({
      stars: 100,
      isExist: true,
      isSubscriptionActive: true,
      subscriptionType: SubscriptionType.NEUROBASE,
      subscriptionStartDate: new Date().toISOString(),
    })
    vi.mocked(getUserBalance).mockResolvedValue(100)
    vi.mocked(priceCalculator.calculateFinalStarPrice).mockReturnValue({
      stars: 10,
      rubles: 10,
      dollars: 0.1,
    })
    vi.mocked(updateUserBalance).mockResolvedValue(true)
    vi.mocked(invalidateBalanceCache).mockImplementation(() => {})
    // Мокируем getUserInfo
    vi.mocked(getUserInfo).mockReturnValue(mockUserInfo)
  })

  // ==================
  // Successful Entry Tests
  // ==================
  it('should enter target scene if balance is sufficient and subscription is active', async () => {
    const mode = ModeEnum.NeuroPhoto
    const requiredStars = 5
    const currentBalance = 10
    ctx = createMockContext({ mode })

    // Переопределяем моки для этого теста
    vi.mocked(getUserDetailsSubscription).mockResolvedValue({
      stars: currentBalance,
      isExist: true,
      isSubscriptionActive: true,
      subscriptionType: SubscriptionType.NEUROBASE,
      subscriptionStartDate: new Date().toISOString(),
    })
    vi.mocked(priceCalculator.calculateFinalStarPrice).mockReturnValue({
      stars: requiredStars,
      rubles: 10,
      dollars: 0.1,
    })
    vi.mocked(getUserBalance).mockResolvedValue(currentBalance)
    vi.mocked(updateUserBalance).mockResolvedValue(true)
    vi.mocked(invalidateBalanceCache).mockImplementation(() => {})

    // Execute
    // @ts-ignore
    await checkBalanceScene.enter(ctx)

    // Check assertions
    expect(priceHelpers.sendInsufficientStarsMessage).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
    expect(ctx.scene.enter).toHaveBeenCalledWith(mode, expect.any(Object)) // Check if target scene is entered
    expect(updateUserBalance).toHaveBeenCalled() // Ensure balance was updated
    expect(invalidateBalanceCache).toHaveBeenCalled() // Ensure cache was invalidated
  })

  it('should handle NeuroTester subscription correctly (always active)', async () => {
    const mode = ModeEnum.ChatWithAvatar
    const requiredStars = 1
    const currentBalance = 100
    ctx = createMockContext({ mode })

    vi.mocked(getUserDetailsSubscription).mockResolvedValue({
      stars: 100,
      isExist: true,
      isSubscriptionActive: true,
      subscriptionType: SubscriptionType.NEUROTESTER,
      subscriptionStartDate: new Date().toISOString(),
    })
    vi.mocked(priceCalculator.calculateFinalStarPrice).mockReturnValue({
      stars: requiredStars,
      rubles: 1,
      dollars: 0.01,
    })
    vi.mocked(getUserBalance).mockResolvedValue(currentBalance)
    vi.mocked(updateUserBalance).mockResolvedValue(true)
    vi.mocked(invalidateBalanceCache).mockImplementation(() => {})

    // Execute
    // @ts-ignore
    await checkBalanceScene.enter(ctx)

    // Check assertions
    expect(ctx.scene.leave).not.toHaveBeenCalled()
    expect(ctx.scene.enter).toHaveBeenCalledWith(mode, expect.any(Object)) // Enters target scene
    expect(updateUserBalance).toHaveBeenCalled()
    expect(invalidateBalanceCache).toHaveBeenCalled()
  })

  // ==================
  // Edge Case & Error Handling Tests
  it('should allow access and enter target scene if user exists, has active subscription, and sufficient balance', async () => {
    ctx = createMockContext({ mode: ModeEnum.NeuroPhoto }) // Example paid mode
    vi.mocked(priceCalculator.calculateFinalStarPrice).mockReturnValue({
      stars: 9,
      rubles: 15,
      dollars: 0.15,
    }) // Use calculated cost for NeuroPhoto
    // Используем spyOn для переопределения мока
    vi.mocked(getUserDetailsSubscription).mockResolvedValue({
      stars: 100,
      isExist: true,
      isSubscriptionActive: true,
      subscriptionType: SubscriptionType.NEUROBASE,
      subscriptionStartDate: new Date().toISOString(),
    })

    // @ts-ignore - Temporarily ignore middleware type mismatch for testing enter logic
    await checkBalanceScene.enter(ctx)

    // Check messages
    expect(priceHelpers.sendBalanceMessage).toHaveBeenCalledWith(
      ctx,
      100,
      9,
      false,
      'test_bot'
    )
    expect(priceHelpers.sendInsufficientStarsMessage).not.toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalledWith(
      expect.stringContaining('Could not find your profile')
    )
    expect(ctx.scene.leave).not.toHaveBeenCalled()

    // Check scene transition (indirectly via enterTargetScene which calls ctx.scene.enter)
    // We expect enterTargetScene to be called, which then calls ctx.scene.enter
    // Since enterTargetScene is part of the scene, we test its effect: ctx.scene.enter call
    expect(ctx.scene.enter).toHaveBeenCalledWith(
      ModeEnum.NeuroPhoto,
      expect.any(Object)
    )
  })

  it('should deny access and leave scene if balance is insufficient', async () => {
    ctx = createMockContext({ mode: ModeEnum.DigitalAvatarBodyV2, steps: 10 }) // Expensive mode
    vi.mocked(priceCalculator.calculateFinalStarPrice).mockReturnValue({
      stars: 187,
      rubles: 300,
      dollars: 3.0,
    }) // High cost
    // Используем spyOn для переопределения мока
    vi.mocked(getUserDetailsSubscription).mockResolvedValue({
      stars: 50, // Low balance
      isExist: true,
      isSubscriptionActive: true,
      subscriptionType: SubscriptionType.NEUROBASE,
      subscriptionStartDate: new Date().toISOString(),
    })

    // @ts-ignore - Temporarily ignore middleware type mismatch for testing enter logic
    await checkBalanceScene.enter(ctx)

    // Check messages
    expect(priceHelpers.sendBalanceMessage).toHaveBeenCalledWith(
      ctx,
      50,
      187,
      false,
      'test_bot'
    )
    expect(priceHelpers.sendInsufficientStarsMessage).toHaveBeenCalledWith(
      ctx,
      50,
      false
    )
    expect(ctx.scene.enter).not.toHaveBeenCalled() // Should not enter target scene
    expect(ctx.scene.leave).toHaveBeenCalled() // Should leave the checkBalanceScene
  })

  it('should deny access and enter StartScene if subscription is inactive', async () => {
    ctx = createMockContext({ mode: ModeEnum.NeuroPhoto })
    // Используем spyOn для переопределения мока
    vi.mocked(getUserDetailsSubscription).mockResolvedValue({
      stars: 100,
      isExist: true,
      isSubscriptionActive: false, // Inactive subscription
      subscriptionType: null,
      subscriptionStartDate: null,
    })

    // @ts-ignore - Temporarily ignore middleware type mismatch for testing enter logic
    await checkBalanceScene.enter(ctx)

    // Check messages/actions
    expect(ctx.reply).not.toHaveBeenCalledWith(
      expect.stringContaining('Insufficient stars')
    ) // No balance check message
    expect(priceHelpers.sendBalanceMessage).not.toHaveBeenCalled()
    expect(priceHelpers.sendInsufficientStarsMessage).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled() // Does not call leave directly
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.StartScene) // Redirects to StartScene
  })

  it('should deny access and enter StartScene if user does not exist', async () => {
    ctx = createMockContext({ mode: ModeEnum.NeuroPhoto })
    // Используем spyOn для переопределения мока
    vi.mocked(getUserDetailsSubscription).mockResolvedValue({
      stars: 0,
      isExist: false, // User does not exist
      isSubscriptionActive: false,
      subscriptionType: null,
      subscriptionStartDate: null,
    })

    // @ts-ignore - Temporarily ignore middleware type mismatch for testing enter logic
    await checkBalanceScene.enter(ctx)

    // Check messages/actions
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Could not find your profile')
    )
    expect(priceHelpers.sendBalanceMessage).not.toHaveBeenCalled()
    expect(priceHelpers.sendInsufficientStarsMessage).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.StartScene) // Redirects to StartScene
  })

  it('should allow access to free modes even with zero balance (but active subscription)', async () => {
    ctx = createMockContext({ mode: ModeEnum.MainMenu }) // Free mode
    vi.mocked(priceCalculator.calculateFinalStarPrice).mockReturnValue({
      stars: 0,
      rubles: 0,
      dollars: 0,
    }) // Free
    // Используем spyOn для переопределения мока
    vi.mocked(getUserDetailsSubscription).mockResolvedValue({
      stars: 0, // Zero balance
      isExist: true,
      isSubscriptionActive: true, // Active subscription IS required by current logic
      subscriptionType: SubscriptionType.NEUROBASE,
      subscriptionStartDate: new Date().toISOString(),
    })

    // @ts-ignore - Temporarily ignore middleware type mismatch for testing enter logic
    await checkBalanceScene.enter(ctx)

    // Check messages/actions
    expect(priceHelpers.sendBalanceMessage).not.toHaveBeenCalled() // No cost message for free modes
    expect(priceHelpers.sendInsufficientStarsMessage).not.toHaveBeenCalled()
    expect(ctx.scene.leave).not.toHaveBeenCalled()
    expect(ctx.scene.enter).toHaveBeenCalledWith(
      ModeEnum.MainMenu,
      expect.any(Object)
    ) // Enters the target (free) scene
  })

  it('should handle errors during price calculation', async () => {
    ctx = createMockContext({ mode: ModeEnum.NeuroPhoto })
    vi.mocked(priceCalculator.calculateFinalStarPrice).mockReturnValue(null) // Simulate calculation error
    // Используем spyOn для переопределения мока
    vi.mocked(getUserDetailsSubscription).mockResolvedValue({
      // Ensure user passes initial checks
      stars: 100,
      isExist: true,
      isSubscriptionActive: true,
      subscriptionType: SubscriptionType.NEUROBASE,
      subscriptionStartDate: new Date().toISOString(),
    })

    // @ts-ignore - Temporarily ignore middleware type mismatch for testing enter logic
    await checkBalanceScene.enter(ctx)

    // Check messages/actions
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('error occurred while calculating the cost')
    )
    expect(priceHelpers.sendBalanceMessage).not.toHaveBeenCalled()
    expect(priceHelpers.sendInsufficientStarsMessage).not.toHaveBeenCalled()
    expect(ctx.scene.enter).not.toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled() // Leaves scene on error
  })

  it('should handle errors during Supabase call', async () => {
    ctx = createMockContext({ mode: ModeEnum.NeuroPhoto })
    const supabaseError = new Error('Supabase connection failed')
    // Используем spyOn для переопределения мока
    vi.mocked(getUserDetailsSubscription).mockRejectedValue(supabaseError)

    // @ts-ignore - Temporarily ignore middleware type mismatch for testing enter logic
    await checkBalanceScene.enter(ctx)

    // Check messages/actions
    // Note: Specific error message might not be sent to user, just logged
    expect(ctx.reply).not.toHaveBeenCalled() // Scene might just leave silently or log
    expect(priceHelpers.sendBalanceMessage).not.toHaveBeenCalled()
    expect(priceHelpers.sendInsufficientStarsMessage).not.toHaveBeenCalled()
    expect(ctx.scene.enter).not.toHaveBeenCalled()
    expect(ctx.scene.leave).toHaveBeenCalled() // Leaves scene on error
  })

  // TODO: Add test case for when updateUserBalance fails inside enterTargetScene (might need to adjust mocks/setup)
})
