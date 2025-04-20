import { Request, Response } from 'express'
import { MyContext } from '@/interfaces'
import { handleRobokassaWebhook } from '@/webhooks/robokassa'
import {
  getPendingPayment,
  getPaymentByInvId,
  updatePaymentStatus,
  updateUserBalance,
} from '@/core/supabase'
import { updateUserSubscription } from '@/core/supabase/updateUserSubscription'
import * as robokassa from '@/core/robokassa'
import { PASSWORD2, ADMIN_IDS_ARRAY, NODE_ENV } from '@/config'
import {
  PaymentStatus,
  Payment,
  PaymentType,
} from '@/interfaces/payments.interface'
import { ModeEnum } from '@/interfaces/modes'
import { calculateRobokassaSignature } from '@/webhooks/robokassa/utils/calculateSignature'
import { sendPaymentSuccessMessage } from '@/helpers/notifications'
import { Telegraf } from 'telegraf'
import { mock, MockProxy } from 'jest-mock-extended' // Добавляем импорт для mock

// Убираем мок @/core/supabase
// jest.mock('@/core/supabase')
jest.mock('@/core/robokassa')
jest.mock('@/helpers/notifications')
jest.mock('@/core/supabase/updateUserSubscription')
jest.mock('@/config', () => ({
  PASSWORD2: 'mock_password_2',
  ADMIN_IDS_ARRAY: [12345],
  NODE_ENV: 'test',
}))

// Мокируем зависимости
jest.mock('@/core/supabase', () => ({
  // Мокаем конкретные функции
  getPendingPayment: jest.fn(),
  getPaymentByInvId: jest.fn(),
  updatePaymentStatus: jest.fn(),
  updateUserBalance: jest.fn(),
}))
jest.mock('@/core/supabase/updateUserSubscription') // Мокаем отдельно, если он все еще используется где-то в тесте
jest.mock('@/core/robokassa')

// Получаем типизированные моки
const mockedGetPendingPayment = getPendingPayment as jest.Mock
const mockedGetPaymentByInvId = getPaymentByInvId as jest.Mock
const mockedUpdatePaymentStatus = updatePaymentStatus as jest.Mock
const mockedUpdateUserBalance = updateUserBalance as jest.Mock
const mockedUpdateUserSubscription =
  updateUserSubscription as jest.MockedFunction<typeof updateUserSubscription> // Оставляем, если нужен
const mockedRobokassa = robokassa as jest.Mocked<typeof robokassa>

// Получаем моки конкретных функций для проверки вызовов
const validateRobokassaSignatureMock =
  mockedRobokassa.validateRobokassaSignature as jest.Mock

// Получаем мок sendPaymentSuccessMessage из импорта
const mockedSendPaymentSuccessMessage = sendPaymentSuccessMessage as jest.Mock

// Убираем мок notifications
// const mockedNotifications = notifications as jest.Mocked<typeof notifications>

// Переменные для Express req/res mocks
let mockRequest: Partial<Request>
let mockResponse: Partial<Response>
let statusSpy: jest.Mock
let sendSpy: jest.Mock

// Тестовые данные
const validWebhookQuery = {
  OutSum: '100.00',
  InvId: '123',
  SignatureValue: 'VALID_SIGNATURE',
  shp_user_id: '456', // Пример пользовательского параметра
  shp_payment_uuid: 'abc-123', // UUID платежа
}

// Объявляем переменную для валидного платежа
let validPayment: Payment

// Объявляем mockBot и его тип
let mockBot: MockProxy<Telegraf<MyContext>> // Убираем явное пересечение типов

const dbError = new Error('Database error')

beforeEach(() => {
  // Сбрасываем все моки перед каждым тестом
  jest.clearAllMocks()

  // Воссоздаем validPayment перед каждым тестом
  validPayment = {
    id: '123',
    telegram_id: '456',
    amount: 100,
    stars: 50,
    type: PaymentType.MONEY_INCOME,
    description: 'Test Robokassa Payment',
    bot_name: 'MockBot',
    service_type: ModeEnum.MenuScene,
    payment_method: 'Robokassa',
    status: PaymentStatus.PENDING,
    subscription: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    payment_id: 123,
  }

  // Настраиваем моки для Express Response
  sendSpy = jest.fn()
  statusSpy = jest.fn().mockReturnValue({ send: sendSpy })
  mockResponse = {
    status: statusSpy as any,
    send: sendSpy as any,
  }
  mockRequest = {
    query: {},
  }

  // Создаем мок для Telegraf бота
  mockBot = mock<Telegraf<MyContext>>()
  // Мокируем sendMessage как jest.fn() внутри структуры telegram
  ;(mockBot.telegram.sendMessage as jest.Mock) = jest
    .fn()
    .mockResolvedValue({} as any)

  // Устанавливаем дефолтные реализации моков
  validateRobokassaSignatureMock.mockReturnValue(true)
  mockedGetPendingPayment.mockResolvedValue({ data: null, error: null })
  mockedGetPaymentByInvId.mockResolvedValue({ data: null, error: null })
  mockedUpdatePaymentStatus.mockResolvedValue({ data: null, error: null })
  mockedUpdateUserBalance.mockResolvedValue(true)
  // Убедимся, что мок sendPaymentSuccessMessage возвращает Promise
  mockedSendPaymentSuccessMessage.mockResolvedValue({})
})

describe('handleRobokassaWebhook', () => {
  it('should process a valid webhook successfully', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем ответ базы данных для поиска PENDING платежа
    mockedGetPendingPayment.mockResolvedValue({
      data: validPayment,
      error: null,
    })
    // Мокируем успешное обновление статуса
    mockedUpdatePaymentStatus.mockResolvedValue({ data: null, error: null })
    // Мокируем успешное обновление баланса
    mockedUpdateUserBalance.mockResolvedValue(true)

    // Получаем обработчик, передав мок бота (хотя бот теперь не нужен внутри теста)
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем вызов валидации сигнатуры
    expect(validateRobokassaSignatureMock).toHaveBeenCalledWith(
      validWebhookQuery.OutSum,
      validWebhookQuery.InvId,
      'mock_password_2',
      validWebhookQuery.SignatureValue
      // undefined // Убираем лишний аргумент
    )

    // Проверяем поиск PENDING платежа
    expect(mockedGetPendingPayment).toHaveBeenCalledWith(
      validWebhookQuery.InvId
    )
    expect(mockedGetPaymentByInvId).not.toHaveBeenCalled() // Не должен вызываться в успешном сценарии

    // Проверяем обновление статуса платежа
    expect(mockedUpdatePaymentStatus).toHaveBeenCalledWith(
      validWebhookQuery.InvId,
      PaymentStatus.COMPLETED
    )

    // Проверяем вызов обновления баланса пользователя
    expect(mockedUpdateUserBalance).toHaveBeenCalledWith(
      validPayment.telegram_id,
      validPayment.stars ?? 0,
      'money_income',
      `Пополнение звезд по Robokassa (InvId: ${validWebhookQuery.InvId})`,
      expect.objectContaining({
        payment_method: 'Robokassa',
        inv_id: validWebhookQuery.InvId,
      })
    )

    // Проверяем отправку уведомления пользователю
    expect(mockedSendPaymentSuccessMessage).toHaveBeenCalledWith(
      mockBot, // sendPaymentSuccessMessage теперь принимает bot
      validPayment.telegram_id,
      validPayment.stars ?? 0,
      'ru'
    )

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(200)
    expect(sendSpy).toHaveBeenCalledWith(`OK${validWebhookQuery.InvId}`)
  })

  it('should return 400 if signature is invalid', async () => {
    mockRequest.query = {
      ...validWebhookQuery,
      SignatureValue: 'INVALID_SIGNATURE',
    }
    validateRobokassaSignatureMock.mockReturnValue(false)

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(sendSpy).toHaveBeenCalledWith('Bad Request: Invalid signature')
    // Убедимся, что другие действия не выполнялись
    expect(mockedGetPendingPayment).not.toHaveBeenCalled()
    expect(mockedUpdatePaymentStatus).not.toHaveBeenCalled()
    expect(mockedUpdateUserBalance).not.toHaveBeenCalled()
    expect(mockedSendPaymentSuccessMessage).not.toHaveBeenCalled()
  })

  it('should return 200 if payment is not found (PENDING) but COMPLETED exists', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем PENDING не найден
    mockedGetPendingPayment.mockResolvedValue({ data: null, error: null })
    // Мокируем COMPLETED найден
    const completedPayment = {
      ...validPayment,
      status: PaymentStatus.COMPLETED,
    }
    mockedGetPaymentByInvId.mockResolvedValue({
      data: completedPayment,
      error: null,
    })

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем поиск платежей
    expect(mockedGetPendingPayment).toHaveBeenCalledWith(
      validWebhookQuery.InvId
    )
    expect(mockedGetPaymentByInvId).toHaveBeenCalledWith(
      validWebhookQuery.InvId
    )

    // Проверяем ответ серверу - OK, т.к. уже обработан
    expect(statusSpy).toHaveBeenCalledWith(200)
    expect(sendSpy).toHaveBeenCalledWith(`OK${validWebhookQuery.InvId}`)
    // Убедимся, что другие действия не выполнялись
    expect(mockedUpdatePaymentStatus).not.toHaveBeenCalled()
    expect(mockedUpdateUserBalance).not.toHaveBeenCalled()
    expect(mockedSendPaymentSuccessMessage).not.toHaveBeenCalled()
  })

  it('should return 200 if payment is not found (PENDING and COMPLETED)', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем PENDING не найден
    mockedGetPendingPayment.mockResolvedValue({ data: null, error: null })
    // Мокируем COMPLETED тоже не найден
    mockedGetPaymentByInvId.mockResolvedValue({ data: null, error: null })

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем поиск платежей
    expect(mockedGetPendingPayment).toHaveBeenCalledWith(
      validWebhookQuery.InvId
    )
    expect(mockedGetPaymentByInvId).toHaveBeenCalledWith(
      validWebhookQuery.InvId
    )

    // Проверяем ответ серверу - OK, чтобы Robokassa не повторяла
    expect(statusSpy).toHaveBeenCalledWith(200)
    expect(sendSpy).toHaveBeenCalledWith(`OK${validWebhookQuery.InvId}`)
    // Убедимся, что другие действия не выполнялись
    expect(mockedUpdatePaymentStatus).not.toHaveBeenCalled()
    expect(mockedUpdateUserBalance).not.toHaveBeenCalled()
    expect(mockedSendPaymentSuccessMessage).not.toHaveBeenCalled()
  })

  it('should return 500 if database error occurs during PENDING payment fetch', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем ошибку при поиске PENDING платежа
    mockedGetPendingPayment.mockResolvedValue({ data: null, error: dbError })

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем поиск платежа
    expect(mockedGetPendingPayment).toHaveBeenCalledWith(
      validWebhookQuery.InvId
    )

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith('Internal Server Error')
  })

  it('should return 400 if amount mismatches', async () => {
    mockRequest.query = { ...validWebhookQuery, OutSum: '99.99' } // Неправильная сумма
    // Мокируем успешный поиск PENDING платежа
    mockedGetPendingPayment.mockResolvedValue({
      data: validPayment,
      error: null,
    })

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем поиск платежа
    expect(mockedGetPendingPayment).toHaveBeenCalledWith(
      validWebhookQuery.InvId
    )

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(sendSpy).toHaveBeenCalledWith('Bad Request: Amount mismatch')
    // Убедимся, что другие действия не выполнялись
    expect(mockedUpdatePaymentStatus).not.toHaveBeenCalled()
    expect(mockedUpdateUserBalance).not.toHaveBeenCalled()
    expect(mockedSendPaymentSuccessMessage).not.toHaveBeenCalled()
  })

  it('should return 500 if database error occurs during payment status update', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем успешный поиск PENDING платежа
    mockedGetPendingPayment.mockResolvedValue({
      data: validPayment,
      error: null,
    })
    // Мокируем ошибку при обновлении статуса
    const updateError = new Error('Update error')
    mockedUpdatePaymentStatus.mockResolvedValue({
      data: null,
      error: updateError,
    })

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем поиск и попытку обновления статуса
    expect(mockedGetPendingPayment).toHaveBeenCalledWith(
      validWebhookQuery.InvId
    )
    expect(mockedUpdatePaymentStatus).toHaveBeenCalledWith(
      validWebhookQuery.InvId,
      PaymentStatus.COMPLETED
    )

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith('Internal Server Error')
    // Убедимся, что баланс и уведомление не вызывались
    expect(mockedUpdateUserBalance).not.toHaveBeenCalled()
    expect(mockedSendPaymentSuccessMessage).not.toHaveBeenCalled()
  })

  it('should return 200 (but log CRITICAL) if database error occurs during user balance update', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем успешный поиск и обновление статуса
    mockedGetPendingPayment.mockResolvedValue({
      data: validPayment,
      error: null,
    })
    mockedUpdatePaymentStatus.mockResolvedValue({ data: null, error: null })
    // Мокируем ошибку при обновлении баланса
    const balanceError = new Error('Balance update error')
    mockedUpdateUserBalance.mockResolvedValue(false) // Симулируем ошибку возвратом false
    // TODO: Если updateUserBalance выбрасывает ошибку, нужно мокать mockRejectedValue

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем шаги до обновления баланса
    expect(mockedGetPendingPayment).toHaveBeenCalledWith(
      validWebhookQuery.InvId
    )
    expect(mockedUpdatePaymentStatus).toHaveBeenCalledWith(
      validWebhookQuery.InvId,
      PaymentStatus.COMPLETED
    )
    // Проверяем вызов обновления баланса
    expect(mockedUpdateUserBalance).toHaveBeenCalledWith(
      validPayment.telegram_id,
      validPayment.stars ?? 0,
      'money_income',
      expect.any(String), // Описание может меняться
      expect.any(Object) // Метаданные
    )

    // Проверяем ответ серверу - должен быть OK, но ошибка залогирована
    expect(statusSpy).toHaveBeenCalledWith(200)
    expect(sendSpy).toHaveBeenCalledWith(`OK${validWebhookQuery.InvId}`)
    // Убедимся, что уведомление не отправлялось (т.к. баланс не обновился)
    expect(mockedSendPaymentSuccessMessage).not.toHaveBeenCalled()
  })

  it('should handle missing shp_ parameters in query', async () => {
    const incompleteQuery = {
      OutSum: '100.00',
      InvId: '123',
      SignatureValue: 'VALID_SIGNATURE',
      // shp_payment_uuid is missing
    }
    mockRequest.query = incompleteQuery

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Ожидаем ошибку 400
    expect(statusSpy).toHaveBeenCalledWith(400)
    // Исправляем ожидаемое сообщение об ошибке
    expect(sendSpy).toHaveBeenCalledWith('Bad Request: Missing shp_ parameters')
    expect(validateRobokassaSignatureMock).not.toHaveBeenCalled()
  })
})
