import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { WizardContext } from 'telegraf/typings/scenes'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'

/**
 * @test Start Command Integration Testing
 * @description End-to-end testing of complete start command flows
 * @focus User journey validation, alternative access paths, real-world scenarios
 * @scenarios
 *   - New user complete onboarding flow
 *   - Experienced user quick access flow
 *   - Alternative access to heroes/functions
 *   - Error recovery and graceful degradation
 */

// Create comprehensive mocks for integration testing
jest.mock('@/core/supabase')
jest.mock('@/helpers/getUserUsageCount')
jest.mock('@/helpers/centralizedLanguage')
jest.mock('@/helpers/contextUtils')
jest.mock('@/utils/logger')
jest.mock('@/core/bot')
jest.mock('@/helpers/sendPhotoWithFallback')
jest.mock('@/middlewares/getUserPhotoUrl')
jest.mock('@/store')
jest.mock('@/commands/handleTechSupport')
jest.mock('@/commands/get100Command')
jest.mock('@/commands/priceCommand')
jest.mock('@/helpers/subscriptionGuard')
jest.mock('@/handlers/handleMenu')

describe('Start Command Integration Tests', () => {
  let mockCtx: Partial<MyContext & WizardContext>
  let mockShouldSkipOnboarding: jest.Mock
  let mockGetUserDetailsSubscription: jest.Mock
  let mockCreateUser: jest.Mock
  let mockExtractPromoFromContext: jest.Mock
  let mockGetReferalsCountAndUserData: jest.Mock
  let mockGetTranslation: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup core mocks
    mockShouldSkipOnboarding = jest.fn()
    mockGetUserDetailsSubscription = jest.fn()
    mockCreateUser = jest.fn()
    mockExtractPromoFromContext = jest.fn()
    mockGetReferalsCountAndUserData = jest.fn()
    mockGetTranslation = jest.fn()

    // Wire up mocks
    require('@/helpers/getUserUsageCount').shouldSkipOnboarding = mockShouldSkipOnboarding
    require('@/core/supabase').getUserDetailsSubscription = mockGetUserDetailsSubscription
    require('@/core/supabase').createUser = mockCreateUser
    require('@/core/supabase').getReferalsCountAndUserData = mockGetReferalsCountAndUserData
    require('@/core/supabase').getTranslation = mockGetTranslation
    require('@/helpers/contextUtils').extractPromoFromContext = mockExtractPromoFromContext
    require('@/helpers/centralizedLanguage').isRussianFromState = jest.fn().mockReturnValue(true)
    require('@/helpers/sendPhotoWithFallback').sendPhotoWithFallback = jest.fn().mockResolvedValue(true)
    require('@/middlewares/getUserPhotoUrl').getUserPhotoUrl = jest.fn().mockResolvedValue('https://example.com/avatar.jpg')
    require('@/handlers/getPhotoUrl').getPhotoUrl = jest.fn().mockResolvedValue('https://example.com/photo.jpg')
    require('@/core/bot').BOT_URLS = { test_bot: 'https://example.com/training' }
    require('@/store').defaultSession = { mode: undefined }

    // Setup default mock responses
    mockGetTranslation.mockResolvedValue({
      translation: 'Добро пожаловать в нейро-бота! 🤖 Здесь вы можете создать уникальных AI-героев.',
      url: 'https://example.com/welcome.jpg'
    })
    mockExtractPromoFromContext.mockReturnValue({ isPromo: false })
    mockGetReferalsCountAndUserData.mockResolvedValue({ count: 0, userData: null })

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

    process.env.SUBSCRIBE_CHANNEL_ID = '@test_channel'
  })

  afterEach(() => {
    delete process.env.SUBSCRIBE_CHANNEL_ID
  })

  describe('🆕 Complete New User Journey', () => {
    beforeEach(() => {
      mockShouldSkipOnboarding.mockResolvedValue(false)
      mockGetUserDetailsSubscription.mockResolvedValue({
        isExist: false,
        usage_count: 0
      })
      mockCreateUser.mockResolvedValue([true])
    })

    it('should complete full new user onboarding with heroes access', async () => {
      const { startScene } = require('@/scenes/startScene')

      // Step 1: Initial scene entry
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Verify user experience level check
      expect(mockShouldSkipOnboarding).toHaveBeenCalledWith('123456789', 'test_bot')

      // Verify user creation flow
      expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('123456789')
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'testuser',
          telegram_id: '123456789',
          first_name: 'Test',
          last_name: 'User',
          language_code: 'ru',
          bot_name: 'test_bot'
        })
      )

      // Verify welcome message
      expect(mockCtx.reply).toHaveBeenCalledWith('✅ Аватар успешно создан! Добро пожаловать!')

      // Verify translation and welcome content
      expect(mockGetTranslation).toHaveBeenCalledWith({
        key: 'start',
        ctx: mockCtx,
        bot_name: 'test_bot'
      })

      // Verify training and subscription options are presented
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
              ]),
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

      // Verify admin notification
      expect(mockCtx.telegram.sendMessage).toHaveBeenCalledWith(
        '@test_channel',
        '[test_bot] 🔗 Новый пользователь @testuser (ID: 123456789)'
      )

      // Verify scene proceeds to next step for further interaction
      expect(mockCtx.wizard.next).toHaveBeenCalled()
    })

    it('should provide clear path to heroes through subscription callback', async () => {
      const { startScene } = require('@/scenes/startScene')

      // Complete first step
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Test subscription callback action
      const subscriptionAction = startScene.action('go_to_subscription_scene') as Function
      await subscriptionAction(mockCtx)

      expect(mockCtx.answerCbQuery).toHaveBeenCalled()
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)

      // Verify state is cleaned up on scene transition
      expect(mockCtx.wizard.state).toEqual(expect.not.objectContaining({
        initialDisplayDone: true
      }))
    })

    it('should handle new user with referral code end-to-end', async () => {
      // Setup referral scenario
      mockCtx.session.inviteCode = '987654321'
      mockGetReferalsCountAndUserData.mockResolvedValue({
        count: 3,
        userData: { user_id: '987654321', username: 'referrer_user' }
      })

      const { startScene } = require('@/scenes/startScene')
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Verify referral processing
      expect(mockGetReferalsCountAndUserData).toHaveBeenCalledWith('987654321')
      expect(mockCtx.session.inviter).toBe('987654321')

      // Verify referrer notification
      expect(mockCtx.telegram.sendMessage).toHaveBeenCalledWith(
        '987654321',
        expect.stringContaining('Новый пользователь @testuser зарегистрировался по вашей ссылке')
      )

      // Verify admin notification includes referrer
      expect(mockCtx.telegram.sendMessage).toHaveBeenCalledWith(
        '@test_channel',
        '[test_bot] 🔗 Новый пользователь @testuser (ID: 123456789) по реф. от @referrer_user'
      )

      // Verify user still gets created properly
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          inviter: '987654321'
        })
      )
    })

    it('should handle new user subscription flow in second step', async () => {
      const { startScene } = require('@/scenes/startScene')

      // Complete first step
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Simulate subscription button text in second step
      mockCtx.message!.text = '💫 Оформить подписку'
      mockCtx.wizard!.state = { initialDisplayDone: true } as any

      const secondStep = startScene.steps[1] as Function
      await secondStep(mockCtx)

      // Should redirect to subscription scene
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)

      // Should clean up state
      expect(mockCtx.wizard.state).toEqual(expect.not.objectContaining({
        initialDisplayDone: true
      }))
    })
  })

  describe('👤 Experienced User Quick Access Journey', () => {
    beforeEach(() => {
      mockShouldSkipOnboarding.mockResolvedValue(true)
      mockGetUserDetailsSubscription.mockResolvedValue({
        isExist: true,
        usage_count: 25,
        subscriptionType: 'NEUROTESTER'
      })
    })

    it('should redirect experienced users directly to main menu', async () => {
      const { startScene } = require('@/scenes/startScene')

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Verify experience level check
      expect(mockShouldSkipOnboarding).toHaveBeenCalledWith('123456789', 'test_bot')

      // Verify immediate redirect to main menu
      expect(mockCtx.session.mode).toBe(ModeEnum.MainMenu)
      expect(mockCtx.scene.leave).toHaveBeenCalled()
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)

      // Verify user creation is skipped
      expect(mockCreateUser).not.toHaveBeenCalled()
      expect(mockCtx.reply).not.toHaveBeenCalledWith('✅ Аватар успешно создан! Добро пожаловать!')

      // Verify onboarding content is skipped
      expect(mockCtx.replyWithHTML).not.toHaveBeenCalled()
    })

    it('should handle experienced user admin notification', async () => {
      const { startScene } = require('@/scenes/startScene')

      // Mock that user gets past shouldSkipOnboarding check but proceeds with existing user flow
      mockShouldSkipOnboarding.mockResolvedValue(false) // First check allows continuation

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should notify admin about existing user restart
      expect(mockCtx.telegram.sendMessage).toHaveBeenCalledWith(
        '@test_channel',
        '[test_bot] 🔄 Пользователь @testuser (ID: 123456789) перезапустил бота (/start).'
      )
    })

    it('should provide menu access through global commands', async () => {
      const { startScene } = require('@/scenes/startScene')

      // Simulate menu command
      mockCtx.message!.text = '/menu'
      mockCtx.wizard!.state = { initialDisplayDone: true } as any

      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should handle menu command directly
      expect(mockCtx.scene.leave).toHaveBeenCalled()
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
      expect(mockCtx.session.mode).toBe(ModeEnum.MainMenu)
    })

    it('should handle experienced user edge case in second step', async () => {
      const { startScene } = require('@/scenes/startScene')

      // Simulate experienced user somehow reaching second step
      const secondStep = startScene.steps[1] as Function
      await secondStep(mockCtx)

      // Should redirect to main menu as protection
      expect(mockShouldSkipOnboarding).toHaveBeenCalledWith('123456789', 'test_bot')
      expect(mockCtx.session.mode).toBe(ModeEnum.MainMenu)
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })
  })

  describe('🔄 Alternative Access Path Validation', () => {
    it('should ensure heroes remain accessible through multiple paths', async () => {
      // Test 1: New user primary path (subscription scene)
      mockShouldSkipOnboarding.mockResolvedValue(false)
      mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false })
      mockCreateUser.mockResolvedValue([true])

      const { startScene } = require('@/scenes/startScene')
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Primary path: Should show subscription button
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

      // Test 2: Menu command path
      jest.clearAllMocks()
      mockCtx.message!.text = '/menu'
      mockCtx.wizard!.state = { initialDisplayDone: true } as any

      await firstStep(mockCtx)

      // Menu path: Should redirect to main menu
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)

      // Test 3: Direct subscription callback
      jest.clearAllMocks()
      const subscriptionAction = startScene.action('go_to_subscription_scene') as Function
      await subscriptionAction(mockCtx)

      // Direct path: Should go to subscription scene
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    })

    it('should validate alternative access for experienced users', async () => {
      mockShouldSkipOnboarding.mockResolvedValue(true)

      const { startScene } = require('@/scenes/startScene')
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Experienced users go directly to main menu
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)

      // From main menu, they should be able to access all features including subscription/heroes
      // This is validated by the main menu scene, but the path is preserved
    })

    it('should handle support command as alternative access', async () => {
      const mockHandleTechSupport = jest.fn()
      require('@/commands/handleTechSupport').handleTechSupport = mockHandleTechSupport

      mockCtx.message!.text = '/support'
      mockCtx.wizard!.state = { initialDisplayDone: true } as any

      const { startScene } = require('@/scenes/startScene')
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      expect(mockCtx.scene.leave).toHaveBeenCalled()
      expect(mockHandleTechSupport).toHaveBeenCalledWith(mockCtx)
    })
  })

  describe('⚠️ Error Recovery & Graceful Degradation', () => {
    it('should handle shouldSkipOnboarding failures gracefully', async () => {
      mockShouldSkipOnboarding.mockRejectedValue(new Error('Usage count check failed'))
      mockGetUserDetailsSubscription.mockResolvedValue({
        isExist: true,
        usage_count: 5
      })

      const { startScene } = require('@/scenes/startScene')
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should continue with normal flow despite error
      expect(mockGetUserDetailsSubscription).toHaveBeenCalled()
      expect(mockCtx.replyWithHTML).toHaveBeenCalled() // Should show existing user content
    })

    it('should handle database connection failures', async () => {
      mockShouldSkipOnboarding.mockResolvedValue(false)
      mockGetUserDetailsSubscription.mockRejectedValue(new Error('Database connection failed'))

      const { startScene } = require('@/scenes/startScene')
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should show error message and exit gracefully
      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Произошла ошибка при обработке вашего профиля.'
      )
      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })

    it('should handle user creation failures gracefully', async () => {
      mockShouldSkipOnboarding.mockResolvedValue(false)
      mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false })
      mockCreateUser.mockRejectedValue(new Error('User creation failed'))

      const { startScene } = require('@/scenes/startScene')
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should show error message and exit
      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Произошла ошибка при создании вашего профиля.'
      )
      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })

    it('should handle notification failures without blocking main flow', async () => {
      mockShouldSkipOnboarding.mockResolvedValue(false)
      mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false })
      mockCreateUser.mockResolvedValue([true])
      mockCtx.telegram.sendMessage = jest.fn().mockRejectedValue(new Error('Notification failed'))

      const { startScene } = require('@/scenes/startScene')
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Main flow should continue despite notification failure
      expect(mockCreateUser).toHaveBeenCalled()
      expect(mockCtx.reply).toHaveBeenCalledWith('✅ Аватар успешно создан! Добро пожаловать!')
      expect(mockCtx.replyWithHTML).toHaveBeenCalled()

      // Should attempt notification but not fail
      expect(mockCtx.telegram.sendMessage).toHaveBeenCalled()
    })

    it('should handle missing environment variables gracefully', async () => {
      delete process.env.SUBSCRIBE_CHANNEL_ID

      mockShouldSkipOnboarding.mockResolvedValue(false)
      mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false })
      mockCreateUser.mockResolvedValue([true])

      const { startScene } = require('@/scenes/startScene')
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)

      // Should work without admin notifications
      expect(mockCreateUser).toHaveBeenCalled()
      expect(mockCtx.reply).toHaveBeenCalledWith('✅ Аватар успешно создан! Добро пожаловать!')
      expect(mockCtx.replyWithHTML).toHaveBeenCalled()

      // Should not attempt notifications without channel ID
      expect(mockCtx.telegram.sendMessage).not.toHaveBeenCalled()
    })

    it('should handle subscription callback errors gracefully', async () => {
      mockCtx.scene.enter = jest.fn().mockRejectedValue(new Error('Scene transition failed'))

      const { startScene } = require('@/scenes/startScene')
      const subscriptionAction = startScene.action('go_to_subscription_scene') as Function
      await subscriptionAction(mockCtx)

      // Should show error message
      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Произошла ошибка. Попробуйте позже.'
      )

      // Should clean up and exit
      expect(mockCtx.scene.leave).toHaveBeenCalled()
    })
  })

  describe('🚀 Performance Integration', () => {
    it('should complete new user flow within performance SLA', async () => {
      mockShouldSkipOnboarding.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(false), 10))
      )
      mockGetUserDetailsSubscription.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ isExist: false }), 15))
      )
      mockCreateUser.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve([true]), 20))
      )

      const { startScene } = require('@/scenes/startScene')

      const start = performance.now()
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)
      const end = performance.now()

      // Complete new user flow should be under 200ms
      expect(end - start).toBeLessThan(200)

      // Verify all steps completed
      expect(mockShouldSkipOnboarding).toHaveBeenCalled()
      expect(mockGetUserDetailsSubscription).toHaveBeenCalled()
      expect(mockCreateUser).toHaveBeenCalled()
      expect(mockCtx.replyWithHTML).toHaveBeenCalled()
    })

    it('should complete experienced user flow within performance SLA', async () => {
      mockShouldSkipOnboarding.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(true), 10))
      )

      const { startScene } = require('@/scenes/startScene')

      const start = performance.now()
      const firstStep = startScene.steps[0] as Function
      await firstStep(mockCtx)
      const end = performance.now()

      // Experienced user redirect should be very fast (under 50ms)
      expect(end - start).toBeLessThan(50)

      // Verify quick redirect
      expect(mockShouldSkipOnboarding).toHaveBeenCalled()
      expect(mockCtx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('should handle concurrent users with consistent performance', async () => {
      const userCount = 20
      const userFlows = []

      // Setup different user types
      mockShouldSkipOnboarding.mockImplementation((telegramId) => {
        const id = parseInt(telegramId)
        return Promise.resolve(id % 3 === 0) // Every 3rd user is experienced
      })

      mockGetUserDetailsSubscription.mockImplementation((telegramId) => {
        const id = parseInt(telegramId)
        return Promise.resolve(
          id % 3 === 0
            ? { isExist: true, usage_count: 10 }
            : { isExist: false, usage_count: 0 }
        )
      })

      mockCreateUser.mockResolvedValue([true])

      const { startScene } = require('@/scenes/startScene')

      // Create concurrent user flows
      for (let i = 0; i < userCount; i++) {
        const userCtx = {
          ...mockCtx,
          from: { ...mockCtx.from, id: 100000000 + i }
        }

        userFlows.push(async () => {
          const firstStep = startScene.steps[0] as Function
          return firstStep(userCtx)
        })
      }

      const start = performance.now()
      await Promise.all(userFlows.map(flow => flow()))
      const end = performance.now()

      // Should handle concurrent users efficiently
      expect(end - start).toBeLessThan(300)
      expect(mockShouldSkipOnboarding).toHaveBeenCalledTimes(userCount)
    })
  })
})