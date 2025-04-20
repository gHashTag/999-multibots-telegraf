import { jest, describe, it, beforeEach, afterEach, expect } from '@jest/globals'
import { removeWebhooks } from '../../src/utils/removeWebhooks'
import { logger } from '../../src/utils/logger'

describe('removeWebhooks util', () => {
  let bot: any
  let infoSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {})
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {})
    bot = {
      botInfo: { username: 'bot1' },
      telegram: {
        getMe: jest.fn(),
        getWebhookInfo: jest.fn(),
        deleteWebhook: jest.fn(),
      },
    }
  })

  afterEach(() => {
    infoSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('resolves true and logs info when no webhook set', async () => {
    bot.telegram.getMe.mockResolvedValue({})
    bot.telegram.getWebhookInfo.mockResolvedValue({ url: '' })
    const res = await removeWebhooks(bot)
    expect(res).toBe(true)
    expect(infoSpy).toHaveBeenCalledWith(
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
    expect(infoSpy).toHaveBeenCalledWith(
      '✅ Вебхук удален:',
      expect.objectContaining({ old_url: 'https://hook', bot_name: 'bot1' })
    )
  })

  it('returns false on unauthorized error without retry', async () => {
    const err = new Error('401: Unauthorized')
    bot.telegram.getMe.mockRejectedValue(err)
    const res = await removeWebhooks(bot)
    expect(res).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(
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
    expect(infoSpy).toHaveBeenCalledWith(
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
    expect(errorSpy).toHaveBeenCalledWith(
      '❌ Ошибка при повторной попытке удаления вебхука:',
      expect.any(Object)
    )
  })
})