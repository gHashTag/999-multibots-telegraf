import { Telegraf, Telegram } from 'telegraf'
import { jest } from '@jest/globals'
import {
  setupErrorHandler,
  clearErrorHandlerTimers,
} from '@/helpers/error/errorHandler'
import { MyContext } from '@/interfaces'

// Мокируем логгер правильно - до импорта модуля errorHandler
jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}))

// Импортируем сам логгер после мокирования
import * as loggerModule from '@/utils/logger'

describe('errorHandler', () => {
  // Получаем правильно типизированный мок логгера
  const mockedLogger = loggerModule.logger as jest.Mocked<
    typeof loggerModule.logger
  >

  // Создаем объект бота с методом catch
  let catchCb: any
  const mockBot = {
    telegram: {
      sendMessage: jest.fn().mockReturnValue(Promise.resolve({})),
    } as any,
    catch: jest.fn().mockImplementation(cb => {
      catchCb = cb
      return mockBot
    }),
  } as unknown as Telegraf<MyContext>

  beforeEach(() => {
    jest.clearAllMocks()
    // Настраиваем обработчик ошибок для каждого теста
    setupErrorHandler(mockBot)
  })

  afterAll(() => {
    clearErrorHandlerTimers()
  })

  test('регистрирует обработчик catch', () => {
    expect(mockBot.catch).toHaveBeenCalled()
    expect(typeof catchCb).toBe('function')
  })

  test('корректно обрабатывает ошибки авторизации (401)', async () => {
    const err = {
      message: '401: Unauthorized',
      on: { method: 'sendMessage' },
      code: 401,
    }

    const ctxSendMessage = jest.fn().mockReturnValue(Promise.resolve({}))

    const ctx = {
      botInfo: { username: 'testBot' },
      telegram: {
        token: 'test_token',
        sendMessage: ctxSendMessage,
      } as any,
      update: { update_id: 1 },
      from: { id: 123 },
      chat: { id: 123 },
    }

    await catchCb(err, ctx)

    expect(mockedLogger.error).toHaveBeenCalled()
    expect(mockedLogger.error).toHaveBeenCalledWith(
      '🔐 Ошибка авторизации Telegram API:',
      expect.objectContaining({
        error_type: 'AUTH',
        bot_name: 'testBot',
        error_message: '401: Unauthorized',
        error_code: 401,
      })
    )

    // Т.к. это ошибка sendMessage, сообщение пользователю не отправляется
    expect(ctxSendMessage).not.toHaveBeenCalled()
  })

  test('корректно обрабатывает ошибки лимита запросов (429)', async () => {
    const err = {
      message: '429: Too Many Requests',
      description: 'retry after 3',
      on: { method: 'getUpdates' },
      code: 429,
    }

    const ctxSendMessage = jest.fn().mockReturnValue(Promise.resolve({}))

    const ctx = {
      botInfo: { username: 'testBot' },
      telegram: {
        token: 'test_token',
        sendMessage: ctxSendMessage,
      } as any,
      update: { update_id: 2 },
      from: { id: 456 },
      chat: { id: 456 },
    }

    await catchCb(err, ctx)

    expect(mockedLogger.warn).toHaveBeenCalled()
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      '⏱️ Превышен лимит запросов Telegram API:',
      expect.objectContaining({
        error_type: 'RATE_LIMIT',
        bot_name: 'testBot',
        error_message: '429: Too Many Requests',
        error_code: 429,
      })
    )

    // Для ошибок rate limit не отправляем сообщение пользователю
    expect(ctxSendMessage).not.toHaveBeenCalled()
  })

  test('корректно обрабатывает ошибки блокировки бота (403)', async () => {
    const err = {
      message: '403: Forbidden',
      description: 'bot was blocked by the user',
      on: { method: 'sendMessage' },
      code: 403,
    }

    const ctxSendMessage = jest.fn().mockReturnValue(Promise.resolve({}))

    const ctx = {
      botInfo: { username: 'testBot' },
      telegram: {
        token: 'test_token',
        sendMessage: ctxSendMessage,
      } as any,
      update: { update_id: 3 },
      from: { id: 789 },
      chat: { id: 789 },
    }

    await catchCb(err, ctx)

    expect(mockedLogger.warn).toHaveBeenCalled()
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      '🚫 Бот заблокирован пользователем:',
      expect.objectContaining({
        error_type: 'BLOCKED',
        bot_name: 'testBot',
        error_message: '403: Forbidden',
        error_code: 403,
        description: 'bot was blocked by the user',
      })
    )

    // Для ошибок блокировки не отправляем сообщение пользователю (и не можем)
    expect(ctxSendMessage).not.toHaveBeenCalled()
  })

  test('корректно обрабатывает ошибки сообщений (400)', async () => {
    const err = {
      message: '400: Bad Request',
      description: 'message to edit not found',
      on: { method: 'editMessageText' },
      code: 400,
    }

    const ctxSendMessage = jest.fn().mockReturnValue(Promise.resolve({}))

    const ctx = {
      botInfo: { username: 'testBot' },
      telegram: {
        token: 'test_token',
        sendMessage: ctxSendMessage,
      } as any,
      update: { update_id: 4 },
      from: { id: 101 },
      chat: { id: 101 },
    }

    await catchCb(err, ctx)

    expect(mockedLogger.debug).toHaveBeenCalled()
    expect(mockedLogger.debug).toHaveBeenCalledWith(
      '📝 Невозможно изменить сообщение:',
      expect.objectContaining({
        error_type: 'INVALID_MESSAGE',
        bot_name: 'testBot',
        error_message: '400: Bad Request',
        error_code: 400,
      })
    )

    // Для ошибок сообщений не отправляем уведомление пользователю
    expect(ctxSendMessage).not.toHaveBeenCalled()
  })

  test('корректно обрабатывает неизвестные ошибки и отправляет сообщение пользователю', async () => {
    const err = {
      message: 'Unknown error',
      stack: 'Error stack trace',
      on: { method: 'answerCallbackQuery' },
    }

    const ctxSendMessage = jest.fn().mockReturnValue(Promise.resolve({}))

    const ctx = {
      botInfo: { username: 'testBot' },
      telegram: {
        token: 'test_token',
        sendMessage: ctxSendMessage,
      } as any,
      update: { update_id: 6 },
      from: { id: 303 },
      chat: { id: 303 },
    }

    await catchCb(err, ctx)

    expect(mockedLogger.error).toHaveBeenCalled()
    expect(mockedLogger.error).toHaveBeenCalledWith(
      '❓ Неизвестная ошибка Telegram API:',
      expect.objectContaining({
        error_type: 'UNKNOWN',
        bot_name: 'testBot',
        error_message: 'Unknown error',
        stack: 'Error stack trace',
      })
    )

    // Для критических ошибок отправляем уведомление пользователю
    expect(ctxSendMessage).toHaveBeenCalledWith(
      303, // chat.id
      expect.stringContaining('Извините, произошла техническая ошибка')
    )
  })

  test('не отправляет сообщение пользователю при ошибке sendMessage', async () => {
    const err = {
      message: 'Unknown telegram error',
      on: { method: 'sendMessage' },
    }

    const ctxSendMessage = jest.fn().mockReturnValue(Promise.resolve({}))

    const ctx = {
      botInfo: { username: 'testBot' },
      telegram: {
        token: 'test_token',
        sendMessage: ctxSendMessage,
      } as any,
      update: { update_id: 7 },
      from: { id: 404 },
      chat: { id: 404 },
    }

    await catchCb(err, ctx)

    expect(mockedLogger.error).toHaveBeenCalled()

    // Для ошибок sendMessage не пытаемся отправить еще одно сообщение
    expect(ctxSendMessage).not.toHaveBeenCalled()
  })

  test('корректно обрабатывает ошибки отправки сообщения пользователю', async () => {
    const err = {
      message: 'API error',
      on: { method: 'getChat' },
    }

    const ctxSendMessage = jest.fn().mockImplementation(() => {
      return Promise.reject(new Error('Failed to send message'))
    })

    const ctx = {
      botInfo: { username: 'testBot' },
      telegram: {
        token: 'test_token',
        sendMessage: ctxSendMessage,
      } as any,
      update: { update_id: 8 },
      from: { id: 505 },
      chat: { id: 505 },
    }

    await catchCb(err, ctx)

    // Должны увидеть дополнительную ошибку о неудачной попытке отправить сообщение
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Не удалось отправить сообщение об ошибке пользователю'
      ),
      expect.objectContaining({
        user_id: 505,
        error: 'Failed to send message',
      })
    )
  })
})
