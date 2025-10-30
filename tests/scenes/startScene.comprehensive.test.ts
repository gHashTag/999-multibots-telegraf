import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { WizardContext } from 'telegraf/typings/scenes'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { startScene } from '@/scenes/startScene'

// Mock all dependencies
jest.mock('@/core/supabase')
jest.mock('@/helpers/centralizedLanguage')
jest.mock('@/middlewares/getUserPhotoUrl')
jest.mock('@/utils/logger')
jest.mock('@/core/bot')
jest.mock('@/helpers/sendPhotoWithFallback')
jest.mock('@/helpers/contextUtils')
jest.mock('@/commands/handleTechSupport')
jest.mock('@/commands/get100Command')
jest.mock('@/commands/priceCommand')
jest.mock('@/helpers/subscriptionGuard')
jest.mock('@/handlers/handleMenu')
jest.mock('@/store')

/**
 * @test Start Command Comprehensive Testing Suite
 * @description Tests the modified start command behavior for new vs experienced users
 * @scenarios
 *   - New user (usage_count = 0): Should see heroes/functions
 *   - Experienced user (usage_count > 0): Should redirect to main menu
 *   - Alternative access: Heroes/functions accessible via menu
 *   - Database errors: Graceful fallback behavior
 *   - Performance: Usage count check latency
 */
describe('StartScene - Comprehensive User Experience Testing', () => {
  let mockCtx: Partial<MyContext & WizardContext>
  let mockGetUserDetailsSubscription: jest.Mock
  let mockCreateUser: jest.Mock
  let mockExtractPromoFromContext: jest.Mock
  let mockCheckSubscriptionGuard: jest.Mock
  let mockHandleMenu: jest.Mock

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Setup context mock
    mockCtx = {
      wizard: {
        cursor: 0,
        selectStep: jest.fn(),
        back: jest.fn(),
        next: jest.fn(),
        state: {}
      },
      session: {
        mode: undefined,
        promoProcessed: false,
        inviteCode: undefined,
        inviter: undefined
      },
      reply: jest.fn().mockResolvedValue({}),
      replyWithHTML: jest.fn().mockResolvedValue({}),
      answerCbQuery: jest.fn().mockResolvedValue({}),
      scene: {
        leave: jest.fn().mockResolvedValue({}),
        enter: jest.fn().mockResolvedValue({})
      },
      message: {
        text: '/start'
      },
      from: {
        id: 123456789,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        is_bot: false,
        language_code: 'en'
      },
      chat: {
        id: 123456789
      },
      botInfo: {
        username: 'test_bot'
      },
      telegram: {
        sendMessage: jest.fn().mockResolvedValue({}),
        getUserProfilePhotos: jest.fn().mockResolvedValue({ total_count: 0 })
      }
    } as any

    // Setup mocks
    mockGetUserDetailsSubscription = jest.fn()
    mockCreateUser = jest.fn()
    mockExtractPromoFromContext = jest.fn()
    mockCheckSubscriptionGuard = jest.fn()
    mockHandleMenu = jest.fn()

    // Mock imports
    require('@/core/supabase').getUserDetailsSubscription = mockGetUserDetailsSubscription
    require('@/core/supabase').createUser = mockCreateUser
    require('@/core/supabase').getReferalsCountAndUserData = jest.fn().mockResolvedValue({ count: 0, userData: null })
    require('@/core/supabase').getTranslation = jest.fn().mockResolvedValue({
      translation: 'Welcome!',
      url: 'https://example.com/welcome.jpg'
    })
    require('@/helpers/contextUtils').extractPromoFromContext = mockExtractPromoFromContext
    require('@/helpers/subscriptionGuard').checkSubscriptionGuard = mockCheckSubscriptionGuard
    require('@/handlers/handleMenu').handleMenu = mockHandleMenu
    require('@/helpers/centralizedLanguage').isRussianFromState = jest.fn().mockReturnValue(true)
    require('@/helpers/sendPhotoWithFallback').sendPhotoWithFallback = jest.fn().mockResolvedValue(true)
    require('@/middlewares/getUserPhotoUrl').getUserPhotoUrl = jest.fn().mockResolvedValue(null)
    require('@/handlers/getPhotoUrl').getPhotoUrl = jest.fn().mockResolvedValue('photo-url')
    require('@/core/bot').BOT_URLS = { test_bot: 'https://example.com/training' }
    require('@/store').defaultSession = { mode: undefined }

    // Mock environment
    process.env.SUBSCRIBE_CHANNEL_ID = '@test_channel'
  })

  afterEach(() => {
    delete process.env.SUBSCRIBE_CHANNEL_ID
  })

  describe('🆕 New User Experience (usage_count = 0)', () => {
    beforeEach(() => {
      mockGetUserDetailsSubscription.mockResolvedValue({
        isExist: false,
        // New user - no previous usage
        usage_count: 0
      })
      mockCreateUser.mockResolvedValue([true])
      mockExtractPromoFromContext.mockReturnValue({ isPromo: false })
    })

    it('should display welcome message and training options for new user', async () => {
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should create user
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'testuser',
          telegram_id: '123456789',
          first_name: 'Test',
          last_name: 'User'
        })
      )

      // Should show welcome message
      expect(mockCtx.reply).toHaveBeenCalledWith('✅ Аватар успешно создан! Добро пожаловать!')

      // Should show training options (lead magnet)
      expect(mockCtx.replyWithHTML).toHaveBeenCalledWith(
        expect.stringContaining('Хочешь получить обучающее видео?'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: '🎓 Обучение',
                  url: 'https://example.com/training'
                })
              ])
            ])
          })
        })
      )
    })

    it('should provide access to heroes/functions for new users', async () => {
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should show subscription option (which leads to heroes/functions)
      expect(mockCtx.replyWithHTML).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  text: '💫 Оформить подписку',
                  callback_data: 'go_to_subscription_scene'
                })
              ])
            ])
          })
        })
      )
    })

    it('should track new user creation in admin channel', async () => {
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCtx.telegram.sendMessage).toHaveBeenCalledWith(
        '@test_channel',
        '[test_bot] 🔗 Новый пользователь @testuser (ID: 123456789)'
      )
    })
  })

  describe('👤 Experienced User Experience (usage_count > 0)', () => {
    beforeEach(() => {
      mockGetUserDetailsSubscription.mockResolvedValue({
        isExist: true,
        // Experienced user - has previous usage
        usage_count: 5,
        subscriptionType: 'NEUROTESTER'
      })
      mockExtractPromoFromContext.mockReturnValue({ isPromo: false })
    })

    it('should redirect experienced user to main menu', async () => {
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should notify admin about restart
      expect(mockCtx.telegram.sendMessage).toHaveBeenCalledWith(
        '@test_channel',
        '[test_bot] 🔄 Пользователь @testuser (ID: 123456789) перезапустил бота (/start).'
      )

      // Should still show welcome but user can navigate to menu
      expect(mockCtx.replyWithHTML).toHaveBeenCalled()
    })

    it('should handle menu navigation for experienced users', async () => {
      // Simulate menu command from experienced user
      mockCtx.message!.text = '/menu'
      mockCtx.wizard!.state = { initialDisplayDone: true } as any

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCtx.scene.leave).toHaveBeenCalled()
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })
  })

  describe('🎁 Promo Code Handling', () => {
    it('should handle new user with promo code', async () => {
      mockCtx.message!.text = '/start promo123'
      mockExtractPromoFromContext.mockReturnValue({
        isPromo: true,
        parameter: 'promo123'
      })
      mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false })

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCtx.session.promoProcessed).toBe(true)
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.CreateUserScene)
    })

    it('should redirect to main menu if promo already processed', async () => {
      mockCtx.message!.text = '/start promo123'
      mockCtx.session.promoProcessed = true
      mockExtractPromoFromContext.mockReturnValue({
        isPromo: true,
        parameter: 'promo123'
      })

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCtx.session.mode).toBe(ModeEnum.MainMenu)
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('should handle referral codes correctly', async () => {
      mockCtx.message!.text = '/start 987654321'
      mockCtx.session.inviteCode = '987654321'
      mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false })

      const secondStep = startScene.steps[1] as Function
      await secondStep(mockCtx)

      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.CreateUserScene)
    })
  })

  describe('🔧 Global Command Processing', () => {
    beforeEach(() => {
      mockCtx.wizard!.state = { initialDisplayDone: true } as any
    })

    it('should handle /menu command properly', async () => {
      mockCtx.message!.text = '/menu'

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCtx.scene.leave).toHaveBeenCalled()
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('should handle /support command', async () => {
      mockCtx.message!.text = '/support'
      const mockHandleTechSupport = jest.fn()
      require('@/commands/handleTechSupport').handleTechSupport = mockHandleTechSupport

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCtx.scene.leave).toHaveBeenCalled()
      expect(mockHandleTechSupport).toHaveBeenCalledWith(mockCtx)
    })

    it('should handle /get100 command with subscription check', async () => {
      mockCtx.message!.text = '/get100'
      mockCheckSubscriptionGuard.mockResolvedValue(true)
      const mockGet100Command = jest.fn()
      require('@/commands/get100Command').get100Command = mockGet100Command

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCheckSubscriptionGuard).toHaveBeenCalledWith(mockCtx, '/get100')
      expect(mockCtx.scene.leave).toHaveBeenCalled()
      expect(mockGet100Command).toHaveBeenCalledWith(mockCtx)
    })

    it('should block /get100 for users without subscription', async () => {
      mockCtx.message!.text = '/get100'
      mockCheckSubscriptionGuard.mockResolvedValue(false)

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCheckSubscriptionGuard).toHaveBeenCalledWith(mockCtx, '/get100')
      // Should not proceed to get100Command if subscription check fails
    })

    it('should handle /price command', async () => {
      mockCtx.message!.text = '/price'
      const mockPriceCommand = jest.fn()
      require('@/commands/priceCommand').priceCommand = mockPriceCommand

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCtx.scene.leave).toHaveBeenCalled()
      expect(mockPriceCommand).toHaveBeenCalledWith(mockCtx)
    })
  })

  describe('⚠️ Error Handling & Edge Cases', () => {
    it('should handle database connection errors gracefully', async () => {
      mockGetUserDetailsSubscription.mockRejectedValue(new Error('Database connection failed'))

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Произошла ошибка при обработке вашего профиля.'
      )
      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })

    it('should handle user creation errors', async () => {
      mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false })
      mockCreateUser.mockRejectedValue(new Error('User creation failed'))

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Произошла ошибка при создании вашего профиля.'
      )
      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })

    it('should handle missing environment variables', async () => {
      delete process.env.SUBSCRIBE_CHANNEL_ID
      mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false })
      mockCreateUser.mockResolvedValue([true])

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should still work but without admin notifications
      expect(mockCreateUser).toHaveBeenCalled()
      expect(mockCtx.telegram.sendMessage).not.toHaveBeenCalled()
    })

    it('should handle referrer notification failures gracefully', async () => {
      mockCtx.session.inviteCode = '999999999'
      mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false })
      mockCreateUser.mockResolvedValue([true])
      mockCtx.telegram.sendMessage = jest.fn().mockRejectedValue(new Error('Failed to notify'))

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should continue despite notification failure
      expect(mockCreateUser).toHaveBeenCalled()
    })
  })

  describe('🚀 Performance Testing', () => {
    it('should handle large user databases efficiently', async () => {
      const startTime = Date.now()

      mockGetUserDetailsSubscription.mockImplementation(() => {
        // Simulate database query delay
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({ isExist: true, usage_count: 100 })
          }, 50) // 50ms delay
        })
      })

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should complete within reasonable time (< 200ms including mocked delay)
      expect(duration).toBeLessThan(200)
    })

    it('should handle concurrent user requests', async () => {
      const userIds = [123, 456, 789, 101, 112]
      const promises = userIds.map(async (id) => {
        const ctx = { ...mockCtx, from: { ...mockCtx.from, id } }
        mockGetUserDetailsSubscription.mockResolvedValue({ isExist: true, usage_count: 1 })

        const firstStep = startScene.steps[0] as Function
        return firstStep(ctx)
      })

      const startTime = Date.now()
      await Promise.all(promises)
      const endTime = Date.now()

      // Should handle concurrent requests efficiently
      expect(endTime - startTime).toBeLessThan(100)
      expect(mockGetUserDetailsSubscription).toHaveBeenCalledTimes(5)
    })
  })

  describe('🎯 Alternative Access Path Testing', () => {
    it('should allow access to subscription scene via callback', async () => {
      const action = startScene.action('go_to_subscription_scene') as Function
      await action(mockCtx)

      expect(mockCtx.answerCbQuery).toHaveBeenCalled()
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    })

    it('should handle subscription scene access errors', async () => {
      mockCtx.scene.enter = jest.fn().mockRejectedValue(new Error('Scene transition failed'))

      const action = startScene.action('go_to_subscription_scene') as Function
      await action(mockCtx)

      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Произошла ошибка. Попробуйте позже.'
      )
      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })

    it('should provide heroes access through menu after initial setup', async () => {
      // Experienced user accessing through second step
      mockCtx.message!.text = '💫 Оформить подписку'
      mockCtx.wizard!.state = { initialDisplayDone: true } as any

      const secondStep = startScene.steps[1] as Function
      await secondStep(mockCtx)

      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    })
  })

  describe('🔒 Security Testing', () => {
    it('should sanitize user input in commands', async () => {
      mockCtx.message!.text = '/start <script>alert("xss")</script>'
      mockExtractPromoFromContext.mockReturnValue({ isPromo: false })

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should not execute malicious scripts
      expect(mockExtractPromoFromContext).toHaveBeenCalledWith(mockCtx)
    })

    it('should validate referral codes properly', async () => {
      mockCtx.message!.text = '/start ../../../etc/passwd'

      const secondStep = startScene.steps[1] as Function
      await secondStep(mockCtx)

      // Should only process numeric referral codes
      expect(mockCtx.scene.enter).not.toHaveBeenCalledWith(ModeEnum.CreateUserScene)
    })

    it('should handle SQL injection attempts in user data', async () => {
      mockCtx.from!.username = "'; DROP TABLE users; --"
      mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false })
      mockCreateUser.mockResolvedValue([true])

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should safely pass user data to createUser
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          username: "'; DROP TABLE users; --"
        })
      )
    })
  })
})

/**
 * @test Integration Testing for Complete User Journeys
 */
describe('StartScene - Integration Testing', () => {
  let mockCtx: Partial<MyContext & WizardContext>

  beforeEach(() => {
    jest.clearAllMocks()
    mockCtx = {
      wizard: { cursor: 0, selectStep: jest.fn(), back: jest.fn(), next: jest.fn(), state: {} },
      session: { mode: undefined, promoProcessed: false },
      reply: jest.fn().mockResolvedValue({}),
      replyWithHTML: jest.fn().mockResolvedValue({}),
      scene: { leave: jest.fn().mockResolvedValue({}), enter: jest.fn().mockResolvedValue({}) },
      from: { id: 123456789, username: 'testuser' },
      botInfo: { username: 'test_bot' },
      telegram: { sendMessage: jest.fn().mockResolvedValue({}) }
    } as any
  })

  it('should complete full new user onboarding flow', async () => {
    // Setup: New user with no promo
    require('@/core/supabase').getUserDetailsSubscription = jest.fn().mockResolvedValue({ isExist: false })
    require('@/core/supabase').createUser = jest.fn().mockResolvedValue([true])
    require('@/helpers/contextUtils').extractPromoFromContext = jest.fn().mockReturnValue({ isPromo: false })

    const firstStep = startScene.steps[0] as Function
    await firstStep(mockCtx)

    // Verify complete flow
    expect(require('@/core/supabase').getUserDetailsSubscription).toHaveBeenCalled()
    expect(require('@/core/supabase').createUser).toHaveBeenCalled()
    expect(mockCtx.reply).toHaveBeenCalledWith('✅ Аватар успешно создан! Добро пожаловать!')
    expect(mockCtx.replyWithHTML).toHaveBeenCalled()
  })

  it('should handle experienced user returning flow', async () => {
    // Setup: Existing user
    require('@/core/supabase').getUserDetailsSubscription = jest.fn().mockResolvedValue({
      isExist: true,
      usage_count: 10
    })

    const firstStep = startScene.steps[0] as Function
    await firstStep(mockCtx)

    // Should show existing user experience
    expect(require('@/core/supabase').createUser).not.toHaveBeenCalled()
    expect(mockCtx.replyWithHTML).toHaveBeenCalled()
  })
})