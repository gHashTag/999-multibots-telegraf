import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test'
import axios from 'axios'
import { Telegraf } from 'telegraf'
import { v4 as uuidv4 } from 'uuid'
import { generateImageToPrompt } from '@/services/plan_b/generateImageToPrompt'
import { MyContext } from '@/interfaces'
import { User } from '@/interfaces/user.interface'
import { ModeEnum } from '@/interfaces/modes'
import { PaymentType } from '@/interfaces/payments.interface'
import { CostCalculationResult } from '@/price/calculator'
import { Markup } from 'telegraf'

// --- Мокирование Зависимостей --- //

// Мок Supabase
const mockGetUserByTelegramId = mock(
  (id: string): Promise<Partial<User> | null> =>
    Promise.resolve({
      id: 'db-id',
      telegram_id: id,
      username: 'testuser',
      level: 1,
    })
)
const mockUpdateUserLevel = mock((id: string, level: number) =>
  Promise.resolve({ data: null, error: null })
)

// -- Улучшенный Мок directPaymentProcessor --
const mockDirectPaymentProcessor = mock(
  async (params: {
    telegram_id: string
    amount: number
    type: PaymentType
    service_type: ModeEnum
    bot_name: string
    inv_id?: bigint
    metadata?: any
  }) => {
    // Имитируем проверку баланса перед списанием
    const currentBalance = await mockGetUserBalance(params.telegram_id) // Получаем текущий баланс через мок
    if (
      params.type === PaymentType.MONEY_OUTCOME &&
      currentBalance < params.amount
    ) {
      return {
        success: false,
        error: `Недостаточно средств. Баланс: ${currentBalance}, требуется: ${params.amount}`,
        balanceChange: null,
      }
    }

    // Имитируем успешное списание
    const newBalance =
      params.type === PaymentType.MONEY_OUTCOME
        ? currentBalance - params.amount
        : currentBalance // Для упрощения не обрабатываем income
    return {
      success: true,
      balanceChange: {
        before: currentBalance,
        after: newBalance,
      },
    }
  }
)
// -- Конец улучшенного мока --

const mockGetUserBalance = mock(
  async (id: string, bot_name?: string): Promise<number> => {
    // Возвращаем начальный баланс для тестов
    return 100
  }
)

mock.module('@/core/supabase', () => ({
  getUserByTelegramIdString: mockGetUserByTelegramId,
  updateUserLevelPlusOne: mockUpdateUserLevel,
  directPaymentProcessor: mockDirectPaymentProcessor,
  getUserBalance: mockGetUserBalance, // Добавляем мок getUserBalance
  supabase: { from: mock(() => ({})) }, // Базовый мок для supabase, если он вдруг где-то нужен
}))

// Мок Хелперов Ошибок
const mockSendServiceErrorToUser = mock(
  (bot: any, id: string, error: Error, isRu: boolean) => Promise.resolve()
)
const mockSendServiceErrorToAdmin = mock((bot: any, id: string, error: Error) =>
  Promise.resolve()
)
mock.module('@/helpers/error', () => ({
  sendServiceErrorToUser: mockSendServiceErrorToUser,
  sendServiceErrorToAdmin: mockSendServiceErrorToAdmin,
}))

// Мок Калькулятора Цен
const mockCalculateFinalStarPrice = mock(
  (mode: ModeEnum, params?: any): CostCalculationResult | null => {
    if (mode === ModeEnum.TextToImage)
      return { stars: 5, rubles: 50, dollars: 0.5 }
    if (mode === ModeEnum.ImageToPrompt)
      return { stars: 2, rubles: 20, dollars: 0.2 }
    return null
  }
)
mock.module('@/price/calculator', () => ({
  calculateFinalStarPrice: mockCalculateFinalStarPrice,
}))

// Мок axios
const mockAxiosPost = mock((url: string, body: any, config?: any) =>
  Promise.resolve({ data: { event_id: 'mock_event_id' } })
)
const mockAxiosGet = mock((url: string, config?: any) =>
  Promise.resolve({
    data: 'event: result\ndata: ["image description", "mock prompt text"]',
  })
)
mock.module('axios', () => ({
  default: {
    post: mockAxiosPost,
    get: mockAxiosGet,
    isAxiosError: (error: any) => false,
  },
  isAxiosError: (error: any) => false,
}))

// Мок Telegraf
const mockSendMessage = mock(
  (chatId: string | number, text: string, extra?: any) =>
    Promise.resolve({ message_id: 123 })
)
const mockBot = {
  telegram: {
    sendMessage: mockSendMessage,
  },
} as unknown as Telegraf<MyContext>

// Мок Меню (для текста кнопки)
mock.module('@/menu', () => ({
  levels: {
    104: { title_ru: 'Кнопка RU', title_en: 'Button EN' },
  },
}))

// Мок uuid (необязательно, но для консистентности)
mock.module('uuid', () => ({
  v4: () => 'mock-uuid-1234',
}))

// Мок Логгера (для проверки логов, если нужно)
const mockLoggerInfo = mock()
mock.module('@/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}))

// --- Тесты --- //

describe('Plan B: generateImageToPrompt Service', () => {
  beforeEach(() => {
    // Сброс всех моков перед тестом
    mockGetUserByTelegramId.mockClear().mockResolvedValue({
      id: 'db-id',
      telegram_id: '12345',
      username: 'testuser',
      level: 1,
    })
    mockUpdateUserLevel.mockClear()
    // Теперь mockDirectPaymentProcessor сам обрабатывает "баланс"
    mockDirectPaymentProcessor.mockClear()
    mockGetUserBalance.mockClear().mockResolvedValue(100) // Сброс мока getUserBalance
    mockSendServiceErrorToUser.mockClear()
    mockSendServiceErrorToAdmin.mockClear()
    mockCalculateFinalStarPrice.mockClear()
    mockAxiosPost
      .mockClear()
      .mockResolvedValue({ data: { event_id: 'mock_event_id' } })
    mockAxiosGet.mockClear().mockResolvedValue({
      data: 'event: result\ndata: ["image description", "mock prompt text"]',
    })
    mockSendMessage.mockClear()
    ;(mockSendMessage as any).mockResolvedValue({ message_id: 123 }) // Убедимся, что мок сброшен
    mockLoggerInfo.mockClear() // Сброс логгера
  })

  afterEach(() => {
    mock.restore()
  })

  it('should successfully generate prompt from image', async () => {
    // Arrange
    const imageUrl = 'http://example.com/image.jpg'
    const telegram_id = '12345'
    const username = 'testuser'
    const isRu = false
    const bot_name = 'test_bot'
    const expectedPrompt = 'mock prompt text'
    const expectedCost = 7 // 5 (TextToImage) + 2 (ImageToPrompt)
    const expectedBalanceAfter = 93 // 100 - 7
    const hfInitUrl =
      'https://fancyfeast-joy-caption-alpha-two.hf.space/call/stream_chat'
    const hfGetUrl = `${hfInitUrl}/mock_event_id`

    // Мокируем расчет цены
    mockCalculateFinalStarPrice
      .mockImplementationOnce(mode =>
        mode === ModeEnum.TextToImage
          ? { stars: 5, rubles: 0, dollars: 0 }
          : null
      )
      .mockImplementationOnce(mode =>
        mode === ModeEnum.ImageToPrompt
          ? { stars: 2, rubles: 0, dollars: 0 }
          : null
      )

    // Act
    const result = await generateImageToPrompt(
      imageUrl,
      telegram_id,
      username,
      isRu,
      mockBot,
      bot_name
    )

    // Assert:
    // 1. Проверяем результат
    expect(result).toBe(expectedPrompt)

    // 2. Проверка пользователя и уровня
    expect(mockGetUserByTelegramId).toHaveBeenCalledWith(telegram_id)
    expect(mockUpdateUserLevel).not.toHaveBeenCalled()

    // 2.5 Проверка получения баланса
    expect(mockGetUserBalance).toHaveBeenCalledWith(telegram_id, bot_name)

    // 3. Проверка расчета стоимости
    expect(mockCalculateFinalStarPrice).toHaveBeenCalledWith(
      ModeEnum.TextToImage
    )
    expect(mockCalculateFinalStarPrice).toHaveBeenCalledWith(
      ModeEnum.ImageToPrompt
    )
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.stringContaining(`Рассчитанная стоимость: ${expectedCost} звезд`),
      expect.anything()
    )

    // 4. Проверка списания средств
    expect(mockDirectPaymentProcessor).toHaveBeenCalledTimes(1)
    expect(mockDirectPaymentProcessor).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_id,
        amount: expectedCost,
        type: PaymentType.MONEY_OUTCOME,
        service_type: ModeEnum.ImageToPrompt,
        bot_name,
      })
    )

    // 5. Проверка вызовов API Hugging Face
    expect(mockAxiosPost).toHaveBeenCalledTimes(1)
    expect(mockAxiosPost).toHaveBeenCalledWith(
      hfInitUrl,
      expect.anything(),
      expect.anything()
    )
    expect(mockAxiosGet).toHaveBeenCalledTimes(1)
    expect(mockAxiosGet).toHaveBeenCalledWith(hfGetUrl, expect.anything())

    // 6. Проверка отправки сообщений пользователю
    expect(mockSendMessage).toHaveBeenCalledTimes(3) // Старт, Промпт, Баланс
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      1,
      telegram_id,
      '⏳ Generating prompt...'
    )
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      2,
      telegram_id,
      '```\n' + expectedPrompt + '\n```',
      expect.objectContaining({ parse_mode: 'MarkdownV2' })
    )
    expect(mockSendMessage).toHaveBeenNthCalledWith(
      3,
      telegram_id,
      expect.stringContaining(
        `Cost: ${expectedCost.toFixed(2)} ⭐️\nYour balance: ${expectedBalanceAfter.toFixed(2)} ⭐️`
      )
    )

    // 7. Проверка отсутствия ошибок
    expect(mockSendServiceErrorToUser).not.toHaveBeenCalled()
    expect(mockSendServiceErrorToAdmin).not.toHaveBeenCalled()
  })

  // TODO: Добавить тесты для сценариев ошибок
  // - пользователь не найден
  // - ошибка оплаты (directPaymentProcessor) - теперь должна имитироваться самим моком при недостатке средств
  // - ошибка API HF (init - no event_id)
  // - ошибка API HF (get - no data)
  // - ошибка API HF (get - no caption in data)
  // - ошибка API HF (axios network error)
  // - ошибка возврата средств
  // - проверка обновления уровня (level === 2)
})
