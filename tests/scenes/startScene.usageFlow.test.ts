import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { WizardContext } from 'telegraf/typings/scenes'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { startScene } from '@/scenes/startScene'

/**
 * @test Start Scene Usage-Based Flow Testing
 * @description Tests the conditional behavior based on user usage count
 * @focus New user onboarding vs experienced user main menu redirect
 * @scenarios
 *   - usage_count = 0: Full onboarding with heroes access
 *   - usage_count > 0: Intelligent redirect to main menu
 *   - Database errors: Graceful fallback behavior
 *   - Performance: Quick user experience determination
 */

// Mock all dependencies
jest.mock('@/core/supabase')
jest.mock('@/helpers/centralizedLanguage')
jest.mock('@/middlewares/getUserPhotoUrl')
jest.mock('@/utils/logger')
jest.mock('@/core/bot')
jest.mock('@/helpers/sendPhotoWithFallback')
jest.mock('@/helpers/contextUtils')
jest.mock('@/helpers/getUserUsageCount')
jest.mock('@/commands/handleTechSupport')
jest.mock('@/commands/get100Command')
jest.mock('@/commands/priceCommand')
jest.mock('@/helpers/subscriptionGuard')
jest.mock('@/handlers/handleMenu')
jest.mock('@/store')

describe('Start Scene - Usage-Based Flow Testing', () => {
  let mockCtx: Partial<MyContext & WizardContext>
  let mockShouldSkipOnboarding: jest.Mock
  let mockGetUserDetailsSubscription: jest.Mock
  let mockCreateUser: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mocks
    mockShouldSkipOnboarding = jest.fn()
    mockGetUserDetailsSubscription = jest.fn()
    mockCreateUser = jest.fn()

    require('@/helpers/getUserUsageCount').shouldSkipOnboarding = mockShouldSkipOnboarding
    require('@/core/supabase').getUserDetailsSubscription = mockGetUserDetailsSubscription
    require('@/core/supabase').createUser = mockCreateUser
    require('@/core/supabase').getReferalsCountAndUserData = jest.fn().mockResolvedValue({ count: 0 })
    require('@/core/supabase').getTranslation = jest.fn().mockResolvedValue({
      translation: 'Welcome to the bot!',
      url: 'https://example.com/welcome.jpg'
    })
    require('@/helpers/contextUtils').extractPromoFromContext = jest.fn().mockReturnValue({ isPromo: false })
    require('@/helpers/centralizedLanguage').isRussianFromState = jest.fn().mockReturnValue(true)
    require('@/helpers/sendPhotoWithFallback').sendPhotoWithFallback = jest.fn().mockResolvedValue(true)
    require('@/middlewares/getUserPhotoUrl').getUserPhotoUrl = jest.fn().mockResolvedValue(null)
    require('@/handlers/getPhotoUrl').getPhotoUrl = jest.fn().mockResolvedValue('photo-url')
    require('@/core/bot').BOT_URLS = { test_bot: 'https://example.com/training' }
    require('@/store').defaultSession = { mode: undefined }

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
        language_code: 'ru'
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

    // Mock environment
    process.env.SUBSCRIBE_CHANNEL_ID = '@test_channel'
  })

  afterEach(() => {
    delete process.env.SUBSCRIBE_CHANNEL_ID
  })

  describe('🆕 New User Flow (usage_count = 0)', () => {
    beforeEach(() => {
      // New user should not skip onboarding
      mockShouldSkipOnboarding.mockResolvedValue(false)
      mockGetUserDetailsSubscription.mockResolvedValue({
        isExist: false,
        usage_count: 0
      })
      mockCreateUser.mockResolvedValue([true])
    })

    it('should proceed with full onboarding for new users', async () => {
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should check if user should skip onboarding
      expect(mockShouldSkipOnboarding).toHaveBeenCalledWith('123456789', 'test_bot')

      // Should NOT redirect to main menu
      expect(mockCtx.scene.enter).not.toHaveBeenCalledWith(ModeEnum.MainMenu)

      // Should proceed with user creation
      expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('123456789')
      expect(mockCreateUser).toHaveBeenCalled()

      // Should show welcome message
      expect(mockCtx.reply).toHaveBeenCalledWith('✅ Аватар успешно создан! Добро пожаловать!')

      // Should show training and subscription options
      expect(mockCtx.replyWithHTML).toHaveBeenCalledWith(
        expect.stringContaining('Хочешь получить обучающее видео?'),
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

    it('should provide clear path to heroes/functions for new users', async () => {
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should show subscription button leading to heroes
      const subscriptionCall = (mockCtx.replyWithHTML as jest.Mock).mock.calls
        .find(call => call[1]?.reply_markup?.inline_keyboard)

      expect(subscriptionCall).toBeDefined()
      expect(subscriptionCall[1].reply_markup.inline_keyboard).toEqual(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({
              text: '🎓 Обучение',
              url: 'https://example.com/training'
            })
          ]),
          expect.arrayContaining([
            expect.objectContaining({
              text: '💫 Оформить подписку',
              callback_data: 'go_to_subscription_scene'
            })
          ])
        ])
      )
    })

    it('should track new user registration analytics', async () => {
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should notify admin about new user
      expect(mockCtx.telegram.sendMessage).toHaveBeenCalledWith(
        '@test_channel',
        '[test_bot] 🔗 Новый пользователь @testuser (ID: 123456789)'
      )
    })

    it('should handle new user with referral code', async () => {
      mockCtx.session.inviteCode = '987654321'
      require('@/core/supabase').getReferalsCountAndUserData = jest.fn().mockResolvedValue({
        count: 5,
        userData: { user_id: '987654321', username: 'referrer' }
      })

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should set inviter
      expect(mockCtx.session.inviter).toBe('987654321')

      // Should notify referrer
      expect(mockCtx.telegram.sendMessage).toHaveBeenCalledWith(
        '987654321',
        expect.stringContaining('Новый пользователь @testuser зарегистрировался по вашей ссылке')
      )

      // Should notify admin with referrer info
      expect(mockCtx.telegram.sendMessage).toHaveBeenCalledWith(
        '@test_channel',
        '[test_bot] 🔗 Новый пользователь @testuser (ID: 123456789) по реф. от @referrer'
      )
    })
  })

  describe('👤 Experienced User Flow (usage_count > 0)', () => {
    beforeEach(() => {
      // Experienced user should skip onboarding
      mockShouldSkipOnboarding.mockResolvedValue(true)
      mockGetUserDetailsSubscription.mockResolvedValue({
        isExist: true,
        usage_count: 15,
        subscriptionType: 'NEUROTESTER'
      })
    })

    it('should redirect experienced users to main menu immediately', async () => {
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should check if user should skip onboarding
      expect(mockShouldSkipOnboarding).toHaveBeenCalledWith('123456789', 'test_bot')

      // Should redirect to main menu
      expect(mockCtx.session.mode).toBe(ModeEnum.MainMenu)
      expect(mockCtx.scene.leave).toHaveBeenCalled()
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)

      // Should NOT proceed with user creation flow
      expect(mockCreateUser).not.toHaveBeenCalled()
      expect(mockCtx.reply).not.toHaveBeenCalledWith('✅ Аватар успешно создан! Добро пожаловать!')
    })

    it('should log experienced user redirection', async () => {
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Logger should be called with appropriate message
      const logger = require('@/utils/logger').logger
      expect(logger.info).toHaveBeenCalledWith({
        message: `[StartScene] Experienced user detected, redirecting to main menu`,
        telegramId: '123456789',
        botName: 'test_bot',
        function: 'startScene.experiencedUserRedirect'
      })
    })

    it('should handle experienced user in second step (edge case protection)', async () => {
      // Simulate user somehow reaching second step
      const secondStep = startScene.steps[1] as Function
      await secondStep(mockCtx)

      // Should still redirect to main menu as protection
      expect(mockShouldSkipOnboarding).toHaveBeenCalledWith('123456789', 'test_bot')
      expect(mockCtx.session.mode).toBe(ModeEnum.MainMenu)
      expect(mockCtx.scene.leave).toHaveBeenCalled()
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('should optimize performance for experienced user detection', async () => {
      const start = performance.now()

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      const end = performance.now()
      const duration = end - start

      // Should complete quickly (under 50ms)
      expect(duration).toBeLessThan(50)
      expect(mockShouldSkipOnboarding).toHaveBeenCalledTimes(1)
    })
  })

  describe('🎯 Usage Count Determination Logic', () => {
    it('should correctly identify users with multiple transactions', async () => {
      mockShouldSkipOnboarding.mockResolvedValue(true) // Has 3+ transactions

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockShouldSkipOnboarding).toHaveBeenCalledWith('123456789', 'test_bot')
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('should correctly identify users with income history', async () => {
      mockShouldSkipOnboarding.mockResolvedValue(true) // Has income

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockShouldSkipOnboarding).toHaveBeenCalledWith('123456789', 'test_bot')
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('should correctly identify users with multiple service usage', async () => {
      mockShouldSkipOnboarding.mockResolvedValue(true) // Used multiple services

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockShouldSkipOnboarding).toHaveBeenCalledWith('123456789', 'test_bot')
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('should not skip for minimal usage users', async () => {
      mockShouldSkipOnboarding.mockResolvedValue(false) // Minimal usage
      mockGetUserDetailsSubscription.mockResolvedValue({
        isExist: true,
        usage_count: 1 // Just 1 transaction
      })

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should proceed with normal flow (not skip)
      expect(mockShouldSkipOnboarding).toHaveBeenCalledWith('123456789', 'test_bot')
      expect(mockCtx.scene.enter).not.toHaveBeenCalledWith(ModeEnum.MainMenu)
    })
  })

  describe('⚠️ Error Handling & Fallbacks', () => {
    it('should handle shouldSkipOnboarding errors gracefully', async () => {
      mockShouldSkipOnboarding.mockRejectedValue(new Error('Usage count check failed'))
      mockGetUserDetailsSubscription.mockResolvedValue({
        isExist: true,
        usage_count: 10
      })

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should log error and continue with normal flow
      const logger = require('@/utils/logger').logger
      expect(logger.warn).toHaveBeenCalledWith({
        message: `[StartScene] Error checking user experience level, proceeding with normal flow`,
        error: 'Usage count check failed',
        telegramId: '123456789',
        botName: 'test_bot',
        function: 'startScene.userExperienceCheckError'
      })

      // Should continue with existing user flow
      expect(mockGetUserDetailsSubscription).toHaveBeenCalled()
    })

    it('should handle database timeout in usage check', async () => {
      // Simulate timeout in shouldSkipOnboarding
      mockShouldSkipOnboarding.mockImplementation(() =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Database timeout')), 100)
        })
      )

      mockGetUserDetailsSubscription.mockResolvedValue({
        isExist: true,
        usage_count: 5
      })

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should fall back to normal flow despite timeout
      expect(mockGetUserDetailsSubscription).toHaveBeenCalled()
    })

    it('should maintain consistency between first and second steps', async () => {
      // Simulate inconsistent state between steps
      mockShouldSkipOnboarding.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should not skip in first step
      expect(mockCtx.scene.enter).not.toHaveBeenCalledWith(ModeEnum.MainMenu)

      // Reset mocks for second step
      jest.clearAllMocks()

      const secondStep = startScene.steps[1] as Function
      await secondStep(mockCtx)

      // Should catch and redirect in second step if status changed
      expect(mockShouldSkipOnboarding).toHaveBeenCalledWith('123456789', 'test_bot')
    })
  })

  describe('🔄 Alternative Access Validation', () => {
    it('should ensure heroes remain accessible through subscription scene', async () => {
      // New user completes flow and accesses subscription
      mockShouldSkipOnboarding.mockResolvedValue(false)
      mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false })
      mockCreateUser.mockResolvedValue([true])

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should show subscription access button
      expect(mockCtx.replyWithHTML).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({
                  callback_data: 'go_to_subscription_scene'
                })
              ])
            ])
          })
        })
      )
    })

    it('should ensure experienced users can still access subscription via menu', async () => {
      mockShouldSkipOnboarding.mockResolvedValue(true)

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should redirect to main menu where subscription is available
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('should handle subscription callback action correctly', async () => {
      const subscriptionAction = startScene.action('go_to_subscription_scene') as Function
      await subscriptionAction(mockCtx)

      expect(mockCtx.answerCbQuery).toHaveBeenCalled()
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    })
  })

  describe('📊 Performance & Concurrency', () => {
    it('should handle concurrent start requests efficiently', async () => {
      const userIds = [111111111, 222222222, 333333333, 444444444, 555555555]
      const promises = []

      // Setup different usage patterns
      mockShouldSkipOnboarding.mockImplementation((telegramId) => {
        const id = parseInt(telegramId)
        return Promise.resolve(id % 2 === 0) // Every other user is experienced
      })

      mockGetUserDetailsSubscription.mockImplementation((telegramId) => {
        const id = parseInt(telegramId)
        return Promise.resolve({
          isExist: id % 2 === 0,
          usage_count: id % 2 === 0 ? 10 : 0
        })
      })

      const start = performance.now()

      // Create concurrent requests
      for (const id of userIds) {
        const ctx = { ...mockCtx, from: { ...mockCtx.from, id } }
        const firstStep = startScene.steps[0] as Function
        promises.push(firstStep(ctx))
      }

      await Promise.all(promises)
      const end = performance.now()

      // Should complete all requests within reasonable time
      expect(end - start).toBeLessThan(200)
      expect(mockShouldSkipOnboarding).toHaveBeenCalledTimes(5)
    })

    it('should maintain performance under database load', async () => {
      // Simulate variable database response times
      mockShouldSkipOnboarding.mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => resolve(Math.random() > 0.5), Math.random() * 30)
        })
      )

      const iterations = 10
      const durations = []

      for (let i = 0; i < iterations; i++) {
        const start = performance.now()

        const firstStep = startScene.steps[0] as Function
        await firstStep(mockCtx)

        const end = performance.now()
        durations.push(end - start)
      }

      const averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      const maxDuration = Math.max(...durations)

      // Performance should remain reasonable
      expect(averageDuration).toBeLessThan(100) // Average under 100ms
      expect(maxDuration).toBeLessThan(150) // Max under 150ms
    })
  })
})