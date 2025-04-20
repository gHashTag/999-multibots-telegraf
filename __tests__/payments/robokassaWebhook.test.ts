import { Request, Response } from 'express'
import { jest } from '@jest/globals'

// Используем относительные пути вместо @/
import { handleRobokassaWebhook } from '../../src/webhooks/robokassaWebhook'
import { supabaseClient } from '../../src/core/supabase/supabaseClient'
import * as notifications from '../../src/utils/notifications'
import { updateUserSubscription } from '@/core/supabase/updateUserSubscription'
import * as robokassa from '@/core/robokassa' // Импортируем весь модуль
import { config } from '../../src/config' // Мок конфига
import { PaymentStatus, Payment } from '../../src/types/payment' // Относительный путь
import { calculateRobokassaSignature } from '../../src/core/robokassa/utils'
import { sendPaymentSuccessMessage } from '../../src/core/telegram/paymentMessages'
import { ROBO_PASSWORD1, ROBO_PASSWORD2 } from '@/config'
import { Payments } from '../../src/types/supabase'

// Мокируем зависимости с относительными путями
jest.mock('../../src/core/supabase/supabaseClient')
jest.mock('../../src/core/robokassa/utils')
jest.mock('../../src/core/telegram/paymentMessages')
jest.mock('../../src/core/supabase/updateUserSubscription')
jest.mock('../../src/config', () => ({
  ROBO_PASSWORD1: 'test_password_1',
  ROBO_PASSWORD2: 'test_password_2',
}))

// Получаем типизированные моки
const mockedSupabaseClient = supabaseClient as jest.Mocked<
  typeof supabaseClient
>
const mockedNotifications = notifications as jest.Mocked<typeof notifications>
const mockedUpdateUserSubscription =
  updateUserSubscription as jest.MockedFunction<typeof updateUserSubscription>
const mockedRobokassa = robokassa as jest.Mocked<typeof robokassa> // Типизируем мок всего модуля

// Получаем моки конкретных функций для проверки вызовов
const sendPaymentSuccessMessageMock =
  mockedNotifications.sendPaymentSuccessMessage as jest.Mock
const validateRobokassaSignatureMock =
  mockedRobokassa.validateRobokassaSignature as jest.Mock
const mockedCalculateSignature = calculateRobokassaSignature as jest.Mock
const mockedSendPaymentSuccessMessage = jest.fn()

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

const validPayment: Payment = {
  id: 123,
  user_id: 456,
  amount: 100,
  status: PaymentStatus.PENDING,
  provider: 'robokassa',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  payment_uuid: 'abc-123',
  telegram_id: 789, // Пример Telegram ID
}

const dbError = new Error('Database error')

// Переменные для моков Supabase
let maybeSingleMock: jest.Mock
let updateMock: jest.Mock
let eqMock: jest.Mock
let selectMock: jest.Mock
let fromMock: jest.Mock

beforeEach(() => {
  // Сбрасываем все моки перед каждым тестом
  jest.clearAllMocks()

  // Настраиваем моки для Supabase - ДОБАВЛЯЕМ <any, any>
  maybeSingleMock = jest.fn<any, any>()
  updateMock = jest.fn<any, any>().mockReturnThis() // update returns "this" for chaining
  eqMock = jest.fn<any, any>().mockReturnThis() // eq returns "this" for chaining
  selectMock = jest
    .fn<any, any>()
    .mockReturnValue({ maybeSingle: maybeSingleMock }) // select returns object with maybeSingle

  fromMock = jest.fn<any, any>().mockReturnValue({
    update: updateMock,
    eq: eqMock,
    select: selectMock,
  })
  // @ts-ignore - Assigning to read-only property, but it's a mock
  mockedSupabaseClient.from = fromMock

  // Настраиваем моки для Express Response
  sendSpy = jest.fn()
  statusSpy = jest.fn().mockReturnValue({ send: sendSpy }) // status() возвращает объект с методом send()
  mockResponse = {
    status: statusSpy as any, // Используем as any для упрощения
    send: sendSpy as any, // Используем as any для упрощения
  }

  // Базовый мок для Request
  mockRequest = {
    query: {}, // Очищаем query перед каждым тестом
  }

  // Устанавливаем дефолтные реализации моков
  validateRobokassaSignatureMock.mockReturnValue(true) // По умолчанию сигнатура валидна
  ;(mockedUpdateUserSubscription.mockResolvedValue as jest.Mock)({
    data: null,
    error: null,
  }) // Убедимся, что возвращает Promise<{data, error}>
  maybeSingleMock.mockResolvedValue({ data: null, error: null }) // Дефолтное значение для maybeSingle
})

describe('handleRobokassaWebhook', () => {
  it('should process a valid webhook successfully', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем ответ базы данных для поиска платежа
    ;(maybeSingleMock.mockResolvedValue as jest.Mock)({
      data: validPayment,
      error: null,
    })
    // Мокируем успешное обновление подписки (уже сделано в beforeEach)

    // Вызываем обработчик
    await handleRobokassaWebhook(
      mockRequest as Request,
      mockResponse as Response
    )

    // Проверяем вызов валидации сигнатуры
    expect(validateRobokassaSignatureMock).toHaveBeenCalledWith(
      validWebhookQuery.OutSum,
      validWebhookQuery.InvId,
      mockedConfig.robokassa.password2, // Используем пароль из мока конфига
      validWebhookQuery.SignatureValue
    )

    // Проверяем поиск платежа в базе
    expect(fromMock).toHaveBeenCalledWith('payments')
    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith(
      'payment_uuid',
      validWebhookQuery.shp_payment_uuid
    )
    expect(maybeSingleMock).toHaveBeenCalledTimes(1) // Был вызван для select

    // Проверяем обновление статуса платежа
    expect(fromMock).toHaveBeenCalledWith('payments') // Вызвано второй раз для update
    expect(updateMock).toHaveBeenCalledWith({ status: PaymentStatus.COMPLETED })
    expect(eqMock).toHaveBeenCalledWith('id', validPayment.id) // Проверяем eq для update

    // Проверяем вызов обновления подписки пользователя
    expect(mockedUpdateUserSubscription).toHaveBeenCalledWith(
      validPayment.user_id,
      validPayment.amount
    )

    // Проверяем отправку уведомления пользователю
    expect(sendPaymentSuccessMessageMock).toHaveBeenCalledWith(
      validPayment.telegram_id,
      validPayment.amount
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
    // Мокируем валидацию сигнатуры как невалидную
    validateRobokassaSignatureMock.mockReturnValue(false)

    // Вызываем обработчик
    await handleRobokassaWebhook(
      mockRequest as Request,
      mockResponse as Response
    )

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(sendSpy).toHaveBeenCalledWith('Invalid signature')
    // Убедимся, что другие действия не выполнялись
    expect(maybeSingleMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
    expect(mockedUpdateUserSubscription).not.toHaveBeenCalled()
    expect(sendPaymentSuccessMessageMock).not.toHaveBeenCalled()
  })

  it('should return 404 if payment is not found', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем ответ базы данных - платеж не найден
    ;(maybeSingleMock.mockResolvedValue as jest.Mock)({
      data: null,
      error: null,
    }) // Платеж не найден

    // Вызываем обработчик
    await handleRobokassaWebhook(
      mockRequest as Request,
      mockResponse as Response
    )

    // Проверяем поиск платежа
    expect(fromMock).toHaveBeenCalledWith('payments')
    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith(
      'payment_uuid',
      validWebhookQuery.shp_payment_uuid
    )
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(sendSpy).toHaveBeenCalledWith('Payment not found')
    // Убедимся, что другие действия не выполнялись
    expect(updateMock).not.toHaveBeenCalled()
    expect(mockedUpdateUserSubscription).not.toHaveBeenCalled()
    expect(sendPaymentSuccessMessageMock).not.toHaveBeenCalled()
  })

  it('should return 200 if payment is already completed', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем ответ базы данных - платеж уже завершен
    const completedPayment = {
      ...validPayment,
      status: PaymentStatus.COMPLETED,
    }
    ;(maybeSingleMock.mockResolvedValue as jest.Mock)({
      data: completedPayment,
      error: null,
    })

    // Вызываем обработчик
    await handleRobokassaWebhook(
      mockRequest as Request,
      mockResponse as Response
    )

    // Проверяем поиск платежа
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)

    // Проверяем ответ серверу - должен быть OK, т.к. это не ошибка
    expect(statusSpy).toHaveBeenCalledWith(200)
    expect(sendSpy).toHaveBeenCalledWith(
      `OK${validWebhookQuery.InvId} (already processed)`
    )
    // Убедимся, что обновления статуса и подписки не выполнялись повторно
    expect(updateMock).not.toHaveBeenCalled()
    expect(mockedUpdateUserSubscription).not.toHaveBeenCalled()
    expect(sendPaymentSuccessMessageMock).not.toHaveBeenCalled()
  })

  it('should return 500 if database error occurs during payment fetch', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем ошибку при поиске платежа в базе данных
    ;(maybeSingleMock.mockResolvedValue as jest.Mock)({
      data: null,
      error: dbError,
    }) // Ошибка при поиске

    // Вызываем обработчик
    await handleRobokassaWebhook(
      mockRequest as Request,
      mockResponse as Response
    )

    // Проверяем поиск платежа
    expect(maybeSingleMock).toHaveBeenCalledTimes(1)

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith(
      'Internal server error during payment fetch'
    )
  })

  it('should return 500 if database error occurs during payment status update', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем успешный поиск платежа
    ;(maybeSingleMock.mockResolvedValue as jest.Mock)({
      data: validPayment,
      error: null,
    })

    // Мокируем ошибку при обновлении статуса платежа
    const updateError = new Error('Update payment status error')
    // Переопределяем мок `from` конкретно для этого теста, чтобы вернуть ошибку при update
    const updateErrorMock = jest.fn().mockReturnValue({
      // Используем mockRejectedValue для update, чтобы симулировать ошибку
      maybeSingle: jest.fn().mockRejectedValue(updateError),
    })
    const eqErrorMock = jest.fn().mockReturnValue({ update: updateErrorMock })
    const selectErrorMock = jest
      .fn()
      .mockReturnValue({ maybeSingle: maybeSingleMock }) // select все еще работает

    const fromErrorMock = jest.fn((tableName: string) => {
      if (tableName === 'payments') {
        return {
          select: selectErrorMock, // Для первого вызова (fetch)
          update: updateMock, // Для второго вызова (update) - должно быть updateErrorMock? Нет, eqErrorMock
          eq: jest.fn().mockImplementation((col, val) => {
            // Первый eq для select, второй для update
            if (col === 'payment_uuid') return { select: selectErrorMock } // select path
            if (col === 'id')
              return {
                update: jest.fn().mockReturnValue({
                  eq: jest.fn().mockRejectedValue(updateError),
                }),
              } // update path with error
            return this
          }),
        }
      }
      return {
        // Fallback для других таблиц
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      }
    })
    // @ts-ignore - Assign to read-only property
    mockedSupabaseClient.from = fromErrorMock

    // Вызываем обработчик
    await handleRobokassaWebhook(
      mockRequest as Request,
      mockResponse as Response
    )

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith(
      'Internal server error during payment update'
    )
    // Убедимся, что подписка и уведомление не вызывались
    expect(mockedUpdateUserSubscription).not.toHaveBeenCalled()
    expect(sendPaymentSuccessMessageMock).not.toHaveBeenCalled()
  })

  it('should return 500 if database error occurs during user subscription update', async () => {
    mockRequest.query = validWebhookQuery
    // Мокируем успешный поиск и обновление статуса платежа
    ;(maybeSingleMock.mockResolvedValue as jest.Mock)({
      data: validPayment,
      error: null,
    })
    // Мок для update статуса тоже должен быть успешным
    // `fromMock` уже настроен на успешный update/eq в beforeEach

    // Мокируем ошибку при обновлении подписки пользователя
    const subscriptionError = new Error('Update subscription error')
    ;(mockedUpdateUserSubscription.mockRejectedValue as jest.Mock)(
      subscriptionError
    ) // Симулируем ошибку

    // Вызываем обработчик
    await handleRobokassaWebhook(
      mockRequest as Request,
      mockResponse as Response
    )

    // Проверяем, что дошли до обновления подписки
    expect(mockedUpdateUserSubscription).toHaveBeenCalledWith(
      validPayment.user_id,
      validPayment.amount
    )

    // Проверяем ответ серверу
    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith(
      'Internal server error during subscription update'
    )
    // Убедимся, что уведомление не отправлялось
    expect(sendPaymentSuccessMessageMock).not.toHaveBeenCalled()
  })

  it('should handle missing user/payment parameters in query', async () => {
    const incompleteQuery = {
      OutSum: '100.00',
      InvId: '123',
      SignatureValue: 'VALID_SIGNATURE',
      // shp_user_id is missing
      shp_payment_uuid: 'abc-123',
    }
    mockRequest.query = incompleteQuery

    // Вызываем обработчик
    await handleRobokassaWebhook(
      mockRequest as Request,
      mockResponse as Response
    )

    // Ожидаем ошибку 400, так как не хватает пользовательского параметра
    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(sendSpy).toHaveBeenCalledWith('Missing required shp_ parameters')
    expect(validateRobokassaSignatureMock).not.toHaveBeenCalled() // Валидация не должна вызываться
  })
})
