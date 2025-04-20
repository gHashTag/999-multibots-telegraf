import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { removeWebhooks } from '../../src/utils/removeWebhooks'

// Полностью мокаем модуль логгера
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

// Импортируем мокированную версию
import { logger } from '../../src/utils/logger'

// Типизируем мок
const mockedLogger = logger as jest.Mocked<typeof logger>

describe('removeWebhooks util', () => {
  let bot: any
  // Убираем infoSpy, errorSpy, т.к. используем мок модуля

  beforeEach(() => {
    // jest.resetModules() // Сброс модулей может быть не нужен с jest.mock
    jest.clearAllMocks() // Очищаем моки
    // Убираем spyOn
    bot = {
      botInfo: { username: 'bot1' },
      telegram: {
        getMe: jest.fn(),
        getWebhookInfo: jest.fn(),
        deleteWebhook: jest.fn(),
      },
    }
  })

  // Убираем afterEach

  it('resolves true and logs info when no webhook set', async () => {
    bot.telegram.getMe.mockResolvedValue({})
    bot.telegram.getWebhookInfo.mockResolvedValue({ url: '' })
    const res = await removeWebhooks(bot)
    expect(res).toBe(true)
    // Проверяем вызов мока
    expect(mockedLogger.info).toHaveBeenCalledWith(
      'ℹ️ Вебхук не был установлен:',
      expect.objectContaining({ bot_name: 'bot1' })
    )
  })

  it('deletes webhook and logs info when webhook exists', async () => {
    bot.telegram.getMe.mockResolvedValue({})
    bot.telegram.getWebhookInfo.mockResolvedValue({ url: 'https://hook' })
    bot.telegram.deleteWebhook.mockResolvedValue({})
    const res = await removeWebhooks(bot)
    expect(res).toBe(true)
    expect(bot.telegram.deleteWebhook).toHaveBeenCalledWith({ drop_pending_updates: true })
    // Проверяем вызов мока
    expect(mockedLogger.info).toHaveBeenCalledWith(
      '✅ Вебхук удален:',
      expect.objectContaining({ old_url: 'https://hook', bot_name: 'bot1' })
    )
  })

  it('returns false on unauthorized error without retry', async () => {
    const err = new Error('401: Unauthorized')
    bot.telegram.getMe.mockRejectedValue(err)
    const res = await removeWebhooks(bot)
    expect(res).toBe(false)
    // Проверяем вызов мока
    expect(mockedLogger.error).toHaveBeenCalledWith(
      '❌ Ошибка при удалении вебхука:',
      expect.any(Object)
    )
  })

  it('retries deleteWebhook on other errors and succeeds', async () => {
    bot.telegram.getMe.mockResolvedValue({})
    bot.telegram.getWebhookInfo.mockResolvedValue({ url: 'https://hook' })
    const err = new Error('Some error')
    bot.telegram.deleteWebhook
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({})
    const res = await removeWebhooks(bot)
    expect(res).toBe(true)
    expect(bot.telegram.deleteWebhook).toHaveBeenCalledTimes(2)
    // Проверяем вызов мока
    expect(mockedLogger.info).toHaveBeenCalledWith(
      '✅ Вебхук удален после повторной попытки:',
      expect.objectContaining({ bot_name: 'bot1' })
    )
  })

  it('returns false when retry deletion fails', async () => {
    bot.telegram.getMe.mockResolvedValue({})
    bot.telegram.getWebhookInfo.mockResolvedValue({ url: 'https://hook' })
    bot.telegram.deleteWebhook.mockRejectedValue(new Error('fail'))
    const res = await removeWebhooks(bot)
    expect(res).toBe(false)
    // Проверяем вызов мока
    expect(mockedLogger.error).toHaveBeenCalledWith(
      '❌ Ошибка при повторной попытке удаления вебхука:',
      expect.any(Object)
    )
  })
})