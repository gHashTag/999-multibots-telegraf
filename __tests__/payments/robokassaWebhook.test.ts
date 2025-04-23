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
import { mock, MockProxy } from 'jest-mock-extended'

// Мокируем зависимости
jest.mock('@/core/supabase', () => ({
  getPendingPayment: jest.fn(),
  getPaymentByInvId: jest.fn(),
  updatePaymentStatus: jest.fn(),
  updateUserBalance: jest.fn(),
}))
jest.mock('@/core/supabase/updateUserSubscription')
jest.mock('@/core/robokassa')
jest.mock('@/helpers/notifications')
jest.mock('@/config', () => ({
  PASSWORD2: 'mock_password_2',
  ADMIN_IDS_ARRAY: [12345],
  NODE_ENV: 'test',
}))

// Получаем типизированные моки
const mockedGetPendingPayment = getPendingPayment as jest.MockedFunction<
  typeof getPendingPayment
>
const mockedGetPaymentByInvId = getPaymentByInvId as jest.MockedFunction<
  typeof getPaymentByInvId
>
const mockedUpdatePaymentStatus = updatePaymentStatus as jest.MockedFunction<
  typeof updatePaymentStatus
>
const mockedUpdateUserBalance = updateUserBalance as jest.MockedFunction<
  typeof updateUserBalance
>
const mockedUpdateUserSubscription =
  updateUserSubscription as jest.MockedFunction<typeof updateUserSubscription>
const mockedRobokassa = jest.mocked(robokassa)
const mockedSendPaymentSuccessMessage =
  sendPaymentSuccessMessage as jest.MockedFunction<
    typeof sendPaymentSuccessMessage
  >

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
  shp_user_id: '456',
  shp_payment_uuid: 'abc-123',
}

// Объявляем переменную для валидного платежа
let validPayment: Payment

// Объявляем mockBot и его тип
let mockBot: MockProxy<Telegraf<MyContext>>

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
    status: statusSpy,
    send: sendSpy,
  }
  mockRequest = {
    query: {},
  }

  // Создаем мок для Telegraf бота
  mockBot = mock<Telegraf<MyContext>>()
  mockBot.telegram.sendMessage = jest.fn().mockResolvedValue({})

  // Устанавливаем дефолтные реализации моков
  mockedRobokassa.validateRobokassaSignature.mockReturnValue(true)
  mockedGetPendingPayment.mockResolvedValue({ data: null, error: null })
  mockedGetPaymentByInvId.mockResolvedValue({ data: null, error: null })
  mockedUpdatePaymentStatus.mockResolvedValue({ data: null, error: null })
  mockedUpdateUserBalance.mockResolvedValue(1)
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
    // Мокируем успешное обновление баланса и возвращаем корректное значение
    mockedUpdateUserBalance.mockResolvedValue(50) // Это новый баланс после обновления

    // Получаем обработчик, передав мок бота
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем вызов валидации сигнатуры
    expect(mockedRobokassa.validateRobokassaSignature).toHaveBeenCalledWith(
      validWebhookQuery.OutSum,
      validWebhookQuery.InvId,
      'mock_password_2',
      validWebhookQuery.SignatureValue
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
      Number(validWebhookQuery.OutSum) // 100 - сумма в рублях из validWebhookQuery
    )

    // Проверяем отправку уведомления пользователю
    expect(mockedSendPaymentSuccessMessage).toHaveBeenCalledWith(
      mockBot,
      validPayment.telegram_id,
      validPayment.stars ?? 0, // 50 - количество звезд из validPayment
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
    mockedRobokassa.validateRobokassaSignature.mockReturnValue(false)

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
  })

  it('should return 200 if payment is not found at all', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем отсутствие платежей
    mockedGetPendingPayment.mockResolvedValue({ data: null, error: null })
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

    // Проверяем ответ серверу - OK, т.к. это неопасная ситуация
    expect(statusSpy).toHaveBeenCalledWith(200)
    expect(sendSpy).toHaveBeenCalledWith(`OK${validWebhookQuery.InvId}`)
  })

  it('should return 400 if required parameters are missing', async () => {
    mockRequest.query = { OutSum: '100.00' } // Missing InvId and SignatureValue

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(sendSpy).toHaveBeenCalledWith('Bad Request: Missing parameters')
  })

  it('should return 400 if shp_ parameters are missing', async () => {
    mockRequest.query = {
      OutSum: '100.00',
      InvId: '123',
      SignatureValue: 'VALID_SIGNATURE',
      // Missing shp_user_id and shp_payment_uuid
    }

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(sendSpy).toHaveBeenCalledWith('Bad Request: Missing shp_ parameters')
  })

  it('should return 500 if getting payment from DB fails', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем ошибку БД
    mockedGetPendingPayment.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    })

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith('Internal Server Error')
  })

  it('should return 500 if updating payment status fails', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем успешный поиск платежа
    mockedGetPendingPayment.mockResolvedValue({
      data: validPayment,
      error: null,
    })
    // Мокируем ошибку обновления статуса
    mockedUpdatePaymentStatus.mockResolvedValue({
      data: null,
      error: { message: 'Update error' },
    })

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith('Internal Server Error')
  })

  it('should return 200 but log error if updating user balance fails', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем успешный поиск платежа
    mockedGetPendingPayment.mockResolvedValue({
      data: validPayment,
      error: null,
    })
    // Мокируем успешное обновление статуса
    mockedUpdatePaymentStatus.mockResolvedValue({ data: null, error: null })
    // Мокируем ошибку обновления баланса
    mockedUpdateUserBalance.mockResolvedValue(0)

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем ответ серверу - OK, т.к. деньги получены, статус обновлен
    expect(statusSpy).toHaveBeenCalledWith(200)
    expect(sendSpy).toHaveBeenCalledWith(`OK${validWebhookQuery.InvId}`)
  })

  it('should handle uncaught exceptions gracefully', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем исключение
    mockedGetPendingPayment.mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    // Получаем и вызываем обработчик
    const webhookHandler = handleRobokassaWebhook(mockBot)
    await webhookHandler(mockRequest as Request, mockResponse as Response)

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith('Internal Server Error')
  })
})
