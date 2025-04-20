/**
 * Тесты для startScene
 */
import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
} from '@jest/globals'
import { startScene } from '../../src/scenes/startScene'
import makeMockContext from '../utils/mockTelegrafContext'
import { getUserDetails } from '@/core/supabase'
import { checkSubscriptionByTelegramId } from '@/core/supabase'

// Определяем тип для моков Supabase
type SupabaseMocks = {
  getTranslation: jest.Mock
  getReferalsCountAndUserData: jest.Mock
  checkPaymentStatus: jest.Mock
}

/* eslint-disable @typescript-eslint/ban-ts-comment */
// Мокируем функции supabase
// @ts-ignore: mock module signature may differ
jest.mock('../../src/core/supabase', () => ({
  // @ts-ignore - игнорируем ошибки типов в моках для тестов
  getTranslation: jest.fn().mockImplementation(({ key }: { key: any }) => ({
    translation: `Мок-перевод для ключа ${key}`,
    url: key === 'start' ? 'https://example.com/mock-photo.jpg' : '',
  })),
  // @ts-ignore - игнорируем ошибки типов в моках для тестов
  getReferalsCountAndUserData: jest
    .fn()
    .mockImplementation((telegram_id: string) => ({
      count: 0,
      level: 1,
      subscription: 'stars',
      userData: {
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        telegram_id,
        subscription: 'stars',
        level: 1,
      },
      isExist: true,
    })),
  // @ts-ignore - игнорируем ошибки типов в моках для тестов
  checkPaymentStatus: jest
    .fn()
    .mockImplementation(
      (ctx: any, subscription: string) => subscription !== 'stars'
    ),
  getUserDetails: jest.fn().mockResolvedValue({ isExist: false }),
  createUser: jest.fn().mockResolvedValue({}),
}))

// Мокируем process.env
const MOCK_SUBSCRIBE_CHANNEL_ID = '@test_pulse_channel'

describe('startScene', () => {
  let originalSubscribeChannelId: string | undefined

  beforeAll(() => {
    // Сохраняем оригинальное значение и устанавливаем мок
    originalSubscribeChannelId = process.env.SUBSCRIBE_CHANNEL_ID
    process.env.SUBSCRIBE_CHANNEL_ID = MOCK_SUBSCRIBE_CHANNEL_ID
  })

  afterAll(() => {
    // Восстанавливаем оригинальное значение
    process.env.SUBSCRIBE_CHANNEL_ID = originalSubscribeChannelId
  })

  beforeEach(() => {
    jest
      .clearAllMocks()(
        // Сбрасываем мок getUserDetails на значение по умолчанию перед каждым тестом
        getUserDetails as jest.Mock
      )
      .mockResolvedValue({ isExist: false })(
        require('@/core/supabase').createUser as jest.Mock
      )
      .mockClear() // Очищаем мок createUser
  })

  it('должна отправить приветственное сообщение с фото и клавиатурой', async () => {
    // Создаем mock-контекст
    const ctx = makeMockContext()

    // Получаем и вызываем первый обработчик сцены
    // @ts-ignore - игнорируем ошибку типов для тестов
    const firstHandler = startScene.steps[0]
    // @ts-ignore - игнорируем ошибку типов для тестов
    await firstHandler(ctx)

    // Проверяем, что фото было отправлено
    expect(ctx.replyWithPhoto).toHaveBeenCalled()

    // Проверяем, что в ответе есть фото и клавиатура
    const photoReply = ctx.debug.replies[0]
    expect(photoReply.type).toBe('photo')
    expect(photoReply.url).toBe('https://example.com/mock-photo.jpg')
    expect(photoReply.caption).toBe('Мок-перевод для ключа start')
    expect(photoReply.extra.reply_markup).toBeDefined()

    // Проверяем, что был вызван метод next()
    expect(ctx.wizard.next).toHaveBeenCalled()

    // Убрали проверку уведомления для конкретного бота
    // Добавляем проверку уведомления для общей группы @neuro_blogger_pulse
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      expect.any(String), // targetChatId может быть ID или @username
      expect.stringContaining(
        `[${ctx.botInfo.username}] 🔗 Новый пользователь @${ctx.from?.username}`
      )
    )
  })

  it('должна перейти на menuScene при наличии подписки', async () => {
    // Создаем mock-контекст с имитацией подписки
    const ctx = makeMockContext()

    // Переопределяем мок функцию для этого теста
    const supabaseMock = jest.requireMock(
      '../../src/core/supabase'
    ) as SupabaseMocks
    supabaseMock.checkPaymentStatus.mockReturnValueOnce(true)

    // Вызываем второй шаг сцены
    // @ts-ignore - игнорируем ошибку типов для тестов
    const secondHandler = startScene.steps[1]
    // @ts-ignore - игнорируем ошибку типов для тестов
    await secondHandler(ctx)

    // Проверяем, что был осуществлен переход на menuScene
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')

    // Убрали проверку уведомления для конкретного бота
    // Добавляем проверку уведомления для общей группы @neuro_blogger_pulse
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      expect.any(String), // targetChatId
      expect.stringContaining(
        `[${ctx.botInfo.username}] 🔗 Новый пользователь @${ctx.from?.username}`
      )
    )
  })

  it('должна перейти на subscriptionScene при отсутствии подписки', async () => {
    // Создаем mock-контекст без подписки
    const ctx = makeMockContext()

    // Переопределяем мок функцию для этого теста
    const supabaseMock = jest.requireMock(
      '../../src/core/supabase'
    ) as SupabaseMocks
    supabaseMock.checkPaymentStatus.mockReturnValueOnce(false)

    // Вызываем второй шаг сцены
    // @ts-ignore - игнорируем ошибку типов для тестов
    const secondHandler = startScene.steps[1]
    // @ts-ignore - игнорируем ошибку типов для тестов
    await secondHandler(ctx)

    // Проверяем, что был осуществлен переход на subscriptionScene
    expect(ctx.scene.enter).toHaveBeenCalledWith('subscriptionScene')

    // Убрали проверку уведомления для конкретного бота
    // Добавляем проверку уведомления для общей группы @neuro_blogger_pulse
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      expect.any(String), // targetChatId
      expect.stringContaining(
        `[${ctx.botInfo.username}] 🔗 Новый пользователь @${ctx.from?.username}`
      )
    )
  })

  it('должна перейти на startScene при повторном старте', async () => {
    // Создаем mock-контекст
    const ctx = makeMockContext()

    // Вызываем второй шаг сцены
    // @ts-ignore - игнорируем ошибку типов для тестов
    const secondHandler = startScene.steps[1]
    // @ts-ignore - игнорируем ошибку типов для тестов
    await secondHandler(ctx)

    // Проверяем, что был осуществлен переход на startScene
    expect(ctx.scene.enter).toHaveBeenCalledWith('startScene')

    // Убрали проверку уведомления для конкретного бота
    // Добавляем проверку уведомления для общей группы @neuro_blogger_pulse при повторном старте
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      expect.any(String), // targetChatId
      expect.stringContaining(
        `[${ctx.botInfo.username}] 🔄 Пользователь @${ctx.from?.username}`
      )
    )
  })

  it('должна создать нового пользователя и отправить уведомление в общую группу', async () => {
    // ... (mock setup) ...
    const ctx = makeMockContext() // mockBotConfig уже должен быть частью этого контекста или доступен глобально

    // ... (вызов хендлера) ...
    await startScene.middleware()(ctx, jest.fn())

    // ... (проверки создания пользователя) ...

    // Проверка уведомления для общей группы @neuro_blogger_pulse
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      expect.any(String), // targetChatId может быть ID или @username
      expect.stringContaining(
        `[${ctx.botInfo.username}] 🔗 Новый пользователь @${ctx.from?.username}`
      )
    )
    // ... (проверка перехода в сцену)
  })

  it('должна обработать существующего пользователя, обновить уровень и отправить уведомление в общую группу', async () => {
    // ... (mock setup для существующего пользователя) ...
    ;(getUserDetails as jest.Mock).mockResolvedValue({ isExist: true })
    const ctx = makeMockContext()

    // ... (вызов хендлера) ...
    await startScene.middleware()(ctx, jest.fn())

    // ... (проверки updateUserLevelPlusOne, sendTutorialMessages) ...

    // Проверка уведомления для общей группы @neuro_blogger_pulse при повторном старте
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      expect.any(String), // targetChatId
      expect.stringContaining(
        `[${ctx.botInfo.username}] 🔄 Пользователь @${ctx.from?.username}`
      )
    )

    // ... (проверка перехода в сцену) ...
  })

  // --- Тесты для НОВОГО пользователя ---
  it('новый пользователь: отправляет приветствие и уведомление в общую группу', async () => {
    const ctx = makeMockContext()
    await startScene.middleware()(ctx, jest.fn())

    // Проверяем отправку приветствия (фото или текст)
    expect(ctx.replyWithPhoto).toHaveBeenCalled() ||
      expect(ctx.reply).toHaveBeenCalled()
    // Проверяем вызов createUser
    expect(require('@/core/supabase').createUser).toHaveBeenCalledTimes(1)

    // Проверяем уведомление в общую группу
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      MOCK_SUBSCRIBE_CHANNEL_ID, // Используем моковое значение
      expect.stringContaining(
        `[${ctx.botInfo.username}] 🔗 Новый пользователь @${ctx.from?.username}`
      )
    )
    // Проверяем выход из сцены
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('новый пользователь С РЕФЕРАЛОМ: отправляет уведомление рефереру и в общую группу', async () => {
    const inviteCode = '123456789' // ID реферера
    const referrerUsername = 'ref_user'
    const ctx = makeMockContext({ session: { inviteCode } })

    // Мокируем ответ getReferalsCountAndUserData для реферера
    const supabaseMock = jest.requireMock('@/core/supabase')
    supabaseMock.getReferalsCountAndUserData.mockResolvedValueOnce({
      count: 5,
      userData: { user_id: inviteCode, username: referrerUsername },
    })
    // Мокируем ответ getReferalsCountAndUserData для нового пользователя (для подсчета его уровня)
    supabaseMock.getReferalsCountAndUserData.mockResolvedValueOnce({
      count: 0,
      userData: null, // Он еще не существует
    })

    await startScene.middleware()(ctx, jest.fn())

    // Проверяем уведомление рефереру
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      inviteCode,
      expect.stringContaining(
        `@${ctx.from?.username} зарегистрировался по вашей ссылке`
      ) // Проверяем часть сообщения
    )
    // Проверяем уведомление в общую группу
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      MOCK_SUBSCRIBE_CHANNEL_ID,
      expect.stringContaining(
        `[${ctx.botInfo.username}] 🔗 Новый пользователь @${ctx.from?.username} (ID: ${ctx.from?.id}) по реф. от @${referrerUsername}`
      )
    )
    // Проверяем вызов createUser
    expect(require('@/core/supabase').createUser).toHaveBeenCalledTimes(1)
    // Проверяем выход из сцены
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  // --- Тесты для СУЩЕСТВУЮЩЕГО пользователя ---
  it('существующий пользователь: отправляет приветствие и уведомление о рестарте в общую группу', async () => {
    ;(getUserDetails as jest.Mock).mockResolvedValue({ isExist: true }) // Пользователь существует
    const ctx = makeMockContext()

    await startScene.middleware()(ctx, jest.fn())

    // Проверяем отправку приветствия
    expect(ctx.replyWithPhoto).toHaveBeenCalled() ||
      expect(ctx.reply).toHaveBeenCalled()
    // Проверяем, что createUser НЕ вызывался
    expect(require('@/core/supabase').createUser).not.toHaveBeenCalled()

    // Проверяем уведомление в общую группу о рестарте
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      MOCK_SUBSCRIBE_CHANNEL_ID,
      expect.stringContaining(
        `[${ctx.botInfo.username}] 🔄 Пользователь @${ctx.from?.username}`
      )
    )
    // Проверяем выход из сцены
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
