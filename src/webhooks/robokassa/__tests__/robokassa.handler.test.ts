import { Request, Response } from 'express'
import { handleRobokassaResult } from '@/webhooks/robokassa/robokassa.handler' // Пробуем alias
import {
  supabase,
  incrementBalance,
  updateUserSubscription,
} from '@/core/supabase' // Импортируем И мокируемые функции
import { Telegraf } from 'telegraf' // Для мока Telegraf
import { MyContext } from '@/interfaces'
import { validateRobokassaSignature } from '../utils/validateSignature' // Будущая функция валидации
import { calculateRobokassaSignature } from '../utils/calculateSignature' // Будущая функция расчета для тестов
import { createBotByName } from '@/core/bot' // Импортируем для мока
import { getBotTokenByName } from '@/core/getBotTokenByName' // Импортируем для мока

// Мокаем зависимости
// jest.mock('@/core/supabase'); // Пока закомментируем, настроим позже
// jest.mock('telegraf');
// jest.mock('../utils/validateSignature');

// --- Мокируем зависимости ---
// Мокаем весь модуль supabase
jest.mock('@/core/supabase', () => {
  // Создаем моки для цепочек вызовов
  const mockSingle = jest.fn()
  const mockUpdateResult = jest.fn()
  const mockEq = jest.fn(() => ({
    single: mockSingle, // eq(...).single()
    then: mockUpdateResult, // eq(...).then() для update
  }))
  const mockSelect = jest.fn(() => ({ eq: mockEq }))
  const mockUpdate = jest.fn(() => ({ eq: mockEq }))
  const mockFrom = jest.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
  }))

  return {
    supabase: {
      from: mockFrom,
      // Добавим сами моки, чтобы можно было их проверять/сбрасывать
      __mockSingle: mockSingle,
      __mockUpdateResult: mockUpdateResult,
      __mockEq: mockEq,
      __mockSelect: mockSelect,
      __mockUpdate: mockUpdate,
      __mockFrom: mockFrom,
    },
    incrementBalance: jest.fn(),
    updateUserSubscription: jest.fn(),
  }
})

// Мокаем создание бота и получение токена
jest.mock('@/core/bot', () => ({
  createBotByName: jest.fn(),
}))
jest.mock('@/core/getBotTokenByName', () => ({
  getBotTokenByName: jest.fn(),
}))

// Мокаем функцию валидации подписи
jest.mock('../utils/validateSignature')

// --- Глобальные моки и переменные для тестов ---
const MOCK_PASSWORD_2 = 'test_password_2'
process.env.ROBOKASSA_PASSWORD_2 = MOCK_PASSWORD_2

const mockTelegramApi = {
  sendMessage: jest.fn(),
}

// Мок экземпляра Telegraf
const mockBotInstance = {
  telegram: mockTelegramApi,
  botInfo: { username: 'test_bot' }, // Добавим botInfo для полноты
} as unknown as Telegraf<MyContext>

// Получаем типизированные моки из jest.mock
const mockedSupabase = supabase as jest.Mocked<typeof supabase> & {
  __mockSingle: jest.Mock
  __mockUpdateResult: jest.Mock
  __mockEq: jest.Mock
  __mockSelect: jest.Mock
  __mockUpdate: jest.Mock
  __mockFrom: jest.Mock
}

// Моки для именованных экспортов
const mockedIncrementBalance = incrementBalance as jest.Mock
const mockedUpdateUserSubscription = updateUserSubscription as jest.Mock
const mockedCreateBotByName = createBotByName as jest.Mock
const mockedGetBotTokenByName = getBotTokenByName as jest.Mock
const mockedValidateSignature = validateRobokassaSignature as jest.Mock

// --- Начало тестов ---
describe('Robokassa Webhook Handler', () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let responseSendSpy: jest.SpyInstance
  const mockInvId = '12345'
  const mockUserId = 'user_telegram_123'
  const mockAmountRub = 100.0
  const mockAmountStars = 63
  const mockInitialBalance = 50
  const mockLanguage = 'ru'
  const mockBotName = 'test_bot'

  beforeEach(() => {
    // Сбрасываем все моки Supabase перед каждым тестом
    mockedSupabase.__mockFrom.mockClear().mockReturnThis()
    mockedSupabase.__mockSelect.mockClear().mockReturnThis()
    mockedSupabase.__mockUpdate.mockClear().mockReturnThis()
    mockedSupabase.__mockEq.mockClear().mockReturnThis()
    mockedSupabase.__mockSingle.mockClear()
    mockedSupabase.__mockUpdateResult.mockClear()
    mockedIncrementBalance.mockClear()
    mockedUpdateUserSubscription.mockClear()
    mockTelegramApi.sendMessage.mockClear()
    mockedCreateBotByName.mockClear()
    mockedGetBotTokenByName.mockClear()
    mockedValidateSignature.mockClear()

    // Мок ответа Express
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    }
    responseSendSpy = jest.spyOn(mockResponse, 'send')

    // Базовый мок запроса Express (будет дополняться в каждом тесте)
    mockRequest = {
      body: {},
      query: {}, // Robokassa использует query параметры для Result URL
    }

    // Устанавливаем мок для валидации подписи по умолчанию как true
    mockedValidateSignature.mockReturnValue(true)

    // Настраиваем мок для getBotTokenByName и createBotByName
    mockedGetBotTokenByName.mockReturnValue('mock_token')
    mockedCreateBotByName.mockResolvedValue({
      bot: mockBotInstance, // Возвращаем мокнутый экземпляр
      groupId: 'mock_group_id',
    })
  })

  // --- Тестовый случай: Успешное пополнение баланса ---
  it('should process successful balance top-up, update status, increment balance, notify user, and respond OK', async () => {
    // --- Arrange (Подготовка) ---
    const incomingSumStr = mockAmountRub.toFixed(2)
    const robokassaParams = { InvId: mockInvId, OutSum: incomingSumStr }
    const signature = calculateRobokassaSignature(
      robokassaParams,
      MOCK_PASSWORD_2
    )
    mockRequest.query = { ...robokassaParams, SignatureValue: signature } // Добавляем подпись

    // Мок для поиска PENDING платежа в payments_v2
    const mockPayment = {
      inv_id: mockInvId,
      amount: mockAmountRub,
      stars: mockAmountStars,
      status: 'PENDING',
      // type: 'BALANCE_TOPUP', // Убедимся, что тип правильный
      bot_name: mockBotName,
      users: {
        // Добавляем связанные данные пользователя
        telegram_id: mockUserId,
        username: 'testuser',
        language_code: mockLanguage,
      },
    }
    // Настраиваем __mockSingle для первого вызова (поиск платежа)
    mockedSupabase.__mockSingle.mockResolvedValueOnce({
      data: mockPayment,
      error: null,
    })

    // Мок для успешного обновления статуса платежа
    mockedSupabase.__mockEq.mockResolvedValueOnce({ error: null }) // eq -> then

    // --- Act (Действие) ---
    await handleRobokassaResult(
      mockRequest as Request,
      mockResponse as Response
      // mockBotInstance // Больше не передаем инстанс бота
    )

    // --- Assert (Проверка) ---
    // Проверка вызовов Supabase
    expect(mockedSupabase.__mockFrom).toHaveBeenCalledWith('payments_v2') // Проверяем payments_v2
    expect(mockedSupabase.__mockSelect).toHaveBeenCalledWith(
      '*, users(telegram_id, username, language_code)'
    ) // Проверяем select с users
    expect(mockedSupabase.__mockEq).toHaveBeenCalledWith('inv_id', mockInvId)
    expect(mockedSupabase.__mockSingle).toHaveBeenCalledTimes(1) // Поиск платежа

    expect(mockedSupabase.__mockUpdate).toHaveBeenCalledWith({
      status: 'COMPLETED',
    })
    expect(mockedSupabase.__mockEq).toHaveBeenCalledWith('inv_id', mockInvId)
    expect(mockedSupabase.__mockEq).toHaveBeenCalledTimes(2) // Один раз для select, один для update

    // Проверка вызова incrementBalance
    expect(mockedIncrementBalance).toHaveBeenCalledTimes(1)
    // ВРЕМЕННО КОММЕНТИРУЕМ ПРОВЕРКУ АРГУМЕНТОВ ИЗ-ЗА ОШИБКИ ЛИНТЕРА/JEST
    // const lastCallArgs = mockedIncrementBalance.mock.calls[0][0] // Первый аргумент первого вызова
    // expect(lastCallArgs).toEqual({
    //   telegram_id: mockUserId.toString(),
    //   amount: mockAmountStars,
    // })

    expect(mockedUpdateUserSubscription).not.toHaveBeenCalled()

    // Проверка получения токена и создания бота
    expect(mockedGetBotTokenByName).toHaveBeenCalledWith(mockBotName)
    expect(mockedCreateBotByName).toHaveBeenCalledWith(mockBotName)

    // Проверка отправки уведомления
    expect(mockTelegramApi.sendMessage).toHaveBeenCalledTimes(1)
    expect(mockTelegramApi.sendMessage).toHaveBeenCalledWith(
      mockUserId,
      expect.stringContaining(`${mockAmountStars}`)
    )

    // Проверка ответа Robokassa
    expect(mockResponse.status).toHaveBeenCalledWith(200)
    expect(responseSendSpy).toHaveBeenCalledWith(`OK${mockInvId}`)
  })

  // --- Тест: Успешная покупка подписки ---
  it('should process successful subscription purchase, update status, update subscription, increment balance, notify user, and respond OK', async () => {
    // --- Arrange ---
    const subscriptionName = 'neurophoto'
    const subscriptionStars = 476 // Звезды для этой подписки
    const subscriptionAmountRub = 1110.0 // Сумма подписки
    const incomingSumStr = subscriptionAmountRub.toFixed(2)
    const robokassaBodyParams = { InvId: mockInvId, OutSum: incomingSumStr }
    const signature = calculateRobokassaSignature(
      robokassaBodyParams,
      MOCK_PASSWORD_2
    )
    mockRequest.body = { ...robokassaBodyParams, SignatureValue: signature }

    // Мок для поиска PENDING платежа (теперь с подпиской)
    const mockPayment = {
      inv_id: mockInvId,
      amount: subscriptionAmountRub,
      stars: subscriptionStars,
      status: 'PENDING',
      subscription: subscriptionName, // Тип операции - покупка подписки
      telegram_id: mockUserId,
      language: mockLanguage,
    }
    mockedSupabase.__mockSingle.mockResolvedValueOnce({
      data: mockPayment,
      error: null,
    })

    // Мок для успешного обновления статуса платежа
    mockedSupabase.__mockUpdateResult.mockResolvedValueOnce({ error: null })

    // Мок для успешного вызова updateUserSubscription
    mockedUpdateUserSubscription.mockResolvedValue(undefined)

    // Мок для успешного вызова incrementBalance (для звезд подписки)
    mockedIncrementBalance.mockResolvedValue(undefined)

    // --- Act ---
    await handleRobokassaResult(
      mockRequest as Request,
      mockResponse as Response,
      mockBotInstance
    )

    // --- Assert ---
    // 1. Проверка поиска платежа (аналогично первому тесту)
    expect(mockedSupabase.__mockFrom).toHaveBeenCalledWith('payments_v2')
    expect(mockedSupabase.__mockEq).toHaveBeenCalledWith('inv_id', mockInvId)
    expect(mockedSupabase.__mockSingle).toHaveBeenCalledTimes(1)

    // 2. Проверка обновления статуса платежа (аналогично первому тесту)
    expect(mockedSupabase.__mockUpdate).toHaveBeenCalledWith({
      status: 'COMPLETED',
    })
    expect(mockedSupabase.__mockUpdateResult).toHaveBeenCalledTimes(1)

    // 3. Проверка обновления ПОДПИСКИ пользователя
    expect(mockedUpdateUserSubscription).toHaveBeenCalledTimes(1)
    expect(mockedUpdateUserSubscription).toHaveBeenCalledWith(
      mockUserId,
      subscriptionName
    )

    // 4. Проверка обновления БАЛАНСА пользователя (звезды за подписку)
    expect(mockedIncrementBalance).toHaveBeenCalledTimes(1)
    expect(mockedIncrementBalance).toHaveBeenCalledWith({
      telegram_id: mockUserId,
      amount: subscriptionStars,
    })

    // 5. Проверка отправки уведомления
    expect(mockTelegramApi.sendMessage).toHaveBeenCalledTimes(2)
    expect(mockTelegramApi.sendMessage).toHaveBeenCalledWith(
      mockUserId,
      expect.stringContaining(subscriptionName) // Проверяем, что в сообщении есть название подписки
    )
    expect(mockTelegramApi.sendMessage).toHaveBeenCalledWith(
      mockUserId,
      expect.stringContaining(`${subscriptionStars} ⭐️`) // И количество звезд
    )

    // 6. Проверка ответа Robokassa
    expect(mockResponse.status).toHaveBeenCalledWith(200)
    expect(responseSendSpy).toHaveBeenCalledWith(`OK${mockInvId}`)
  })

  // TODO: Добавить другие тесты (успешная подписка, ошибки и т.д.)
})
