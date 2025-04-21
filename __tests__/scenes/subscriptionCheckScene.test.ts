/**
 * Тесты для subscriptionCheckScene
 */
import { jest, describe, it, expect, beforeEach, test } from '@jest/globals'
// Исправляем импорт сцены
import { subscriptionCheckScene } from '../../src/scenes/subscriptionCheckScene'
import makeMockContext from '../utils/mockTelegrafContext'
// Импортируем функцию напрямую
import { checkSubscriptionByTelegramId } from '../../src/core/supabase/checkSubscriptionByTelegramId'
import { MyContext, ModeEnum, SubscriptionType, MySession } from '@/interfaces' // Импортируем нужные типы
import { Composer } from 'telegraf' // Импорт Composer
import { ADMIN_IDS_ARRAY } from '@/config' // Импортируем реальную переменную, но будем мокать ее значение
import { subscriptionMiddleware } from '../../src/scenes/subscriptionMiddleware'
import { logger } from '../../src/utils/logger'

// Мокируем зависимости
jest.mock('../../src/core/supabase/checkSubscriptionByTelegramId')
jest.mock('@/config') // Мокаем конфиг, чтобы переопределить ADMIN_IDS_ARRAY

// Типизируем мок
const mockedCheckSubscription = checkSubscriptionByTelegramId as jest.Mock<
  (id: string) => Promise<SubscriptionType | 'unsubscribed' | 'error' | null>
>

// Добавляем функцию createMockSession
const createMockSession = (): MySession => ({
  selectedPayment: null,
  cursor: 0,
  images: [],
  targetUserId: '',
  userModel: null,
  email: null,
  mode: null,
  prompt: null,
  imageUrl: null,
  videoModel: null,
  paymentAmount: null,
  subscription: null,
  neuroPhotoInitialized: false,
  bypass_payment_check: false,
  videoUrl: undefined,
  audioUrl: undefined,
  inviteCode: undefined,
  inviter: undefined,
  subscriptionStep: undefined,
  memory: undefined,
  attempts: undefined,
  amount: undefined,
  selectedModel: undefined,
  modelName: undefined,
  username: undefined,
  triggerWord: undefined,
  steps: undefined,
  translations: undefined,
  buttons: undefined,
})

describe('subscriptionCheckScene', () => {
  let mockCtx: MyContext
  let checkSubscriptionMock: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockCtx = makeMockContext() as MyContext
    // Mock the checkSubscription function itself for these tests
    checkSubscriptionMock = jest
      .spyOn(subscriptionMiddleware, 'checkSubscription')
      .mockResolvedValue(undefined) // Default mock to resolve without action
  })

  afterEach(() => {
    checkSubscriptionMock.mockRestore()
  })

  it('should call checkSubscription and leave scene on enter', async () => {
    await subscriptionCheckScene.enter(mockCtx)

    // Verify checkSubscription was called
    expect(checkSubscriptionMock).toHaveBeenCalledWith(mockCtx)
    expect(checkSubscriptionMock).toHaveBeenCalledTimes(1)

    // Verify scene leave was called
    expect(mockCtx.scene.leave).toHaveBeenCalledTimes(1)
  })

  it('should log error if checkSubscription fails', async () => {
    const mockError = new Error('Check failed')
    checkSubscriptionMock.mockRejectedValue(mockError)
    const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})

    await subscriptionCheckScene.enter(mockCtx)

    // Verify checkSubscription was called
    expect(checkSubscriptionMock).toHaveBeenCalledWith(mockCtx)
    expect(checkSubscriptionMock).toHaveBeenCalledTimes(1)

    // Verify scene leave was still called
    expect(mockCtx.scene.leave).toHaveBeenCalledTimes(1)

    // Verify error was logged
    expect(loggerSpy).toHaveBeenCalledWith(
      'Error in subscriptionCheckScene:',
      mockError
    )
    loggerSpy.mockRestore()
  })

  it('should still leave scene even if checkSubscription fails', async () => {
    const mockError = new Error('Intentional failure')
    checkSubscriptionMock.mockRejectedValue(mockError)

    // Use try-catch to prevent test failure due to expected error
    try {
      await subscriptionCheckScene.enter(mockCtx)
    } catch (e) {
      // Expected error
    }

    // Verify scene leave was called despite the error
    expect(mockCtx.scene.leave).toHaveBeenCalledTimes(1)
  })

  let ctx: MyContext
  let next: jest.Mock
  let adminId: number
  let userId: number

  beforeEach(() => {
    ctx = makeMockContext()
    next = jest.fn()
    jest.clearAllMocks()
    adminId = 123456789
    userId = 987654321
    // Динамически мокаем ADMIN_IDS_ARRAY перед каждым тестом
    ;(ADMIN_IDS_ARRAY as number[]) = []
  })

  // afterEach больше не нужен, проверки специфичны для тестов

  it('should enter main menu if user is admin', async () => {
    ;(ADMIN_IDS_ARRAY as number[]).push(adminId) // Устанавливаем ID админа
    const sessionData = createMockSession()
    // Передаем from через message
    ctx = makeMockContext(
      {
        message: { from: { id: adminId, is_bot: false, first_name: 'Admin' } },
      },
      sessionData
    )
    await next(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    expect(mockedCheckSubscription).not.toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalled() // Не должно быть сообщения об ошибке
  })

  it('should call checkSubscription for non-admin user', async () => {
    const sessionData = createMockSession()
    ctx = makeMockContext(
      { message: { from: { id: userId, is_bot: false, first_name: 'User' } } },
      sessionData
    )
    mockedCheckSubscription.mockResolvedValue(SubscriptionType.NEUROBASE) // Пример уровня
    await next(ctx)
    expect(mockedCheckSubscription).toHaveBeenCalledWith(userId.toString())
    // Ожидаем вход в MainMenu, т.к. подписка есть
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    expect(ctx.session.subscription).toBe(SubscriptionType.NEUROBASE)
    expect(ctx.reply).not.toHaveBeenCalled() // Не должно быть сообщения об ошибке
  })

  it('should enter subscription scene if check returns unsubscribed', async () => {
    const sessionData = createMockSession()
    ctx = makeMockContext(
      { message: { from: { id: userId, is_bot: false, first_name: 'User' } } },
      sessionData
    )
    mockedCheckSubscription.mockResolvedValue('unsubscribed')
    await next(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    expect(mockedCheckSubscription).toHaveBeenCalledWith(userId.toString())
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('необходимо продлить подписку'),
      expect.anything()
    )
  })

  it('should enter main menu if check returns a valid level', async () => {
    const level = SubscriptionType.NEUROBLOGGER
    const sessionData = createMockSession()
    ctx = makeMockContext(
      { message: { from: { id: userId, is_bot: false, first_name: 'User' } } },
      sessionData
    )
    mockedCheckSubscription.mockResolvedValue(level)
    await next(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    expect(ctx.session.subscription).toBe(level)
    expect(mockedCheckSubscription).toHaveBeenCalledWith(userId.toString())
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('should enter subscription scene on checkSubscription error', async () => {
    const sessionData = createMockSession()
    ctx = makeMockContext(
      { message: { from: { id: userId, is_bot: false, first_name: 'User' } } },
      sessionData
    )
    const error = new Error('DB failed')
    mockedCheckSubscription.mockRejectedValue(error)
    await next(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    expect(mockedCheckSubscription).toHaveBeenCalledWith(userId.toString())
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Ошибка проверки статуса'),
      expect.anything()
    )
  })

  it('should enter subscription scene if user ID is missing', async () => {
    const sessionData = createMockSession()
    // Не передаем from
    ctx = makeMockContext({}, sessionData)
    await next(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    expect(mockedCheckSubscription).not.toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Не удалось определить пользователя'),
      expect.anything()
    )
  })

  // Удаляем тесты, которые использовали другой подход к мокам supabase (spMock)
  // test('should handle database error', async () => { ... })
  // test('should grant access to admin', async () => { ... })

  it('calls the wizard step function', async () => {
    const sceneMiddleware = Composer.unwrap(subscriptionCheckScene.middleware())
    const step = sceneMiddleware[0]
    const mockNext = (): Promise<void> => Promise.resolve()

    // Call the step function
    // ... existing code ...
  })
})
