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

// Мокируем зависимости
jest.mock('../../src/core/supabase/checkSubscriptionByTelegramId')
jest.mock('@/config') // Мокаем конфиг, чтобы переопределить ADMIN_IDS_ARRAY

// Типизируем мок
const mockedCheckSubscription = checkSubscriptionByTelegramId as jest.Mock< (id: string) => Promise<SubscriptionType | 'unsubscribed' | 'error' | null> >

describe('subscriptionCheckScene', () => {
  let ctx: MyContext
  let step: any // Middleware function
  let adminId: number
  let userId: number

  // Получаем шаг сцены
  const sceneMiddleware = Composer.unwrap(subscriptionCheckScene.middleware())
  step = sceneMiddleware[0]
  const mockNext = (): Promise<void> => Promise.resolve()

  // Копируем полное определение createMockSession
  const createMockSession = (overrides: Partial<MySession> = {}): MySession => ({
    // activeWizard: false, // Убираем
    // wizards: {}, // Убираем
    // scene: { current: '', state: {} }, // Убираем
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
    // Добавляем остальные поля из интерфейса MySession, если они есть и обязательны
    // ... (например, neuroPhotoInitialized, bypass_payment_check и т.д., если нужны)
    // Инициализируем обязательные поля какими-то значениями по умолчанию
    neuroPhotoInitialized: false, // Пример
    bypass_payment_check: false, // Пример
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
    ...overrides,
  })

  beforeEach(() => {
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
    ctx = makeMockContext({ message: { from: { id: adminId, is_bot: false, first_name: 'Admin' } } }, sessionData)
    await step(ctx, mockNext)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    expect(mockedCheckSubscription).not.toHaveBeenCalled()
    expect(ctx.reply).not.toHaveBeenCalled() // Не должно быть сообщения об ошибке
  })

  it('should call checkSubscription for non-admin user', async () => {
    const sessionData = createMockSession()
    ctx = makeMockContext({ message: { from: { id: userId, is_bot: false, first_name: 'User' } } }, sessionData)
    mockedCheckSubscription.mockResolvedValue(SubscriptionType.NEUROBASE) // Пример уровня
    await step(ctx, mockNext)
    expect(mockedCheckSubscription).toHaveBeenCalledWith(userId.toString())
    // Ожидаем вход в MainMenu, т.к. подписка есть
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    expect(ctx.session.subscription).toBe(SubscriptionType.NEUROBASE)
    expect(ctx.reply).not.toHaveBeenCalled() // Не должно быть сообщения об ошибке
  })

  it('should enter subscription scene if check returns unsubscribed', async () => {
    const sessionData = createMockSession()
    ctx = makeMockContext({ message: { from: { id: userId, is_bot: false, first_name: 'User' } } }, sessionData)
    mockedCheckSubscription.mockResolvedValue('unsubscribed')
    await step(ctx, mockNext)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    expect(mockedCheckSubscription).toHaveBeenCalledWith(userId.toString())
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('необходимо продлить подписку'), expect.anything())
  })

  it('should enter main menu if check returns a valid level', async () => {
    const level = SubscriptionType.NEUROBLOGGER
    const sessionData = createMockSession()
    ctx = makeMockContext({ message: { from: { id: userId, is_bot: false, first_name: 'User' } } }, sessionData)
    mockedCheckSubscription.mockResolvedValue(level)
    await step(ctx, mockNext)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    expect(ctx.session.subscription).toBe(level)
    expect(mockedCheckSubscription).toHaveBeenCalledWith(userId.toString())
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  it('should enter subscription scene on checkSubscription error', async () => {
    const sessionData = createMockSession()
    ctx = makeMockContext({ message: { from: { id: userId, is_bot: false, first_name: 'User' } } }, sessionData)
    const error = new Error('DB failed')
    mockedCheckSubscription.mockRejectedValue(error)
    await step(ctx, mockNext)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    expect(mockedCheckSubscription).toHaveBeenCalledWith(userId.toString())
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Ошибка проверки статуса'), expect.anything())
  })

  it('should enter subscription scene if user ID is missing', async () => {
    const sessionData = createMockSession()
    // Не передаем from
    ctx = makeMockContext({}, sessionData)
    await step(ctx, mockNext)
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.SubscriptionScene)
    expect(mockedCheckSubscription).not.toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Не удалось определить пользователя'), expect.anything())
  })

  // Удаляем тесты, которые использовали другой подход к мокам supabase (spMock)
  // test('should handle database error', async () => { ... })
  // test('should grant access to admin', async () => { ... })
})
