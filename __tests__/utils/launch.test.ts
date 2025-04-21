// Mocks
jest.mock('@/utils/removeWebhooks', () => ({
  removeWebhooks: jest.fn().mockResolvedValue(true),
}))
jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}))
// Mock express
const useMock = jest.fn()
const listenMock = jest.fn((port, cb) => cb())
const jsonMock = jest.fn()
jest.mock('express', () => {
  const exp: any = () => ({ use: useMock, listen: listenMock })
  exp.json = jsonMock
  return exp
})

// Import after mocks
import { development, production } from '@/utils/launch'
import { removeWebhooks } from '@/utils/removeWebhooks'
import { logger } from '@/utils/logger'
import { Telegraf, MyContext } from 'telegraf'
import express from 'express'

describe('Launch Utilities', () => {
  let bot: Telegraf<MyContext>
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...OLD_ENV }
    // Bot stub
    bot = {
      telegram: {
        deleteWebhook: jest.fn(),
        setWebhook: jest.fn(),
      },
      launch: jest.fn(),
      handleUpdate: jest.fn(),
      catch: jest.fn(),
      use: jest.fn(),
    } as unknown as Telegraf<MyContext>
    // Mock process.env
    process.env = {
      ...process.env,
      MODE: 'polling',
      WEBHOOK_DOMAIN: 'https://example.com',
      SECRET_PATH: 'supersecret',
    }
  })

  describe('development', () => {
    it('should launch in polling mode if MODE=polling', async () => {
      process.env.MODE = 'polling'
      await development(bot)
      expect(bot.telegram.deleteWebhook).toHaveBeenCalled()
      expect(bot.launch).toHaveBeenCalled()
      expect(bot.telegram.setWebhook).not.toHaveBeenCalled()
    })

    it('should launch in webhook mode if MODE=webhook', async () => {
      process.env.MODE = 'webhook'
      // Mock express app methods used in webhook launch
      const mockApp = {
        use: jest.fn().mockReturnThis(),
        listen: jest.fn(),
      }
      ;(express as unknown as jest.Mock).mockReturnValue(mockApp)

      await development(bot)

      expect(bot.telegram.setWebhook).toHaveBeenCalledWith(
        'https://example.com/supersecret'
      )
      // Check if express app is configured and listened on PORT
      expect(express).toHaveBeenCalledTimes(1)
      expect(mockApp.use).toHaveBeenCalledWith(await bot.createWebhook({ domain: 'https://example.com', path: '/supersecret' }))
      expect(mockApp.listen).toHaveBeenCalledWith(
        process.env.PORT || 3000,
        expect.any(Function)
      )
      expect(bot.launch).not.toHaveBeenCalled()
    })

    it('should default to polling if MODE is not set', async () => {
      delete process.env.MODE
      await development(bot)
      expect(bot.telegram.deleteWebhook).toHaveBeenCalled()
      expect(bot.launch).toHaveBeenCalled()
    })

    it('should throw error if webhook domain is missing in webhook mode', async () => {
      process.env.MODE = 'webhook'
      delete process.env.WEBHOOK_DOMAIN
      await expect(development(bot)).rejects.toThrow(
        'WEBHOOK_DOMAIN is not defined in .env file'
      )
    })

    it('should handle errors during launch', async () => {
      process.env.MODE = 'polling'
      const launchError = new Error('Polling launch failed')
      bot.launch = jest.fn().mockRejectedValue(launchError)

      await expect(development(bot)).rejects.toThrow('Polling launch failed')
    })
  })

  it('production: sets up webhook and starts express server', async () => {
    const config = { port: 1234, url: 'https://d.com/path', path: '/hookpath' }
    await expect(
      production(bot, config.port, config.url, config.path)
    ).resolves.toBeUndefined()
    // removeWebhooks called
    expect(removeWebhooks).toHaveBeenCalledWith(bot)
    // Telegram methods
    expect(bot.telegram.getMe).toHaveBeenCalled()
    expect(bot.telegram.setWebhook).toHaveBeenCalledWith(
      config.url,
      expect.objectContaining({ drop_pending_updates: true })
    )
    expect(bot.telegram.getWebhookInfo).toHaveBeenCalled()
    // Express setup
    expect(jsonMock).toHaveBeenCalled()
    expect(useMock).toHaveBeenCalled()
    expect(listenMock).toHaveBeenCalledWith(config.port, expect.any(Function))
    // Logs
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('📡 Информация о вебхуке:'),
      expect.any(Object)
    )
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('✅ Бот слушает вебхуки:'),
      expect.any(Object)
    )
  })

  // TODO: test error path for production launch when removeWebhooks fails
  // it('production: logs error and rethrows on failure', async () => {
  //   const err = new Error('prod fail')
  //   (removeWebhooks as jest.Mock).mockRejectedValueOnce(err)
  //   await expect(production(bot, 1, 'u', '/p')).rejects.toThrow('prod fail')
  //   expect(logger.error).toHaveBeenCalledWith(
  //     expect.stringContaining('❌ Ошибка запуска бота в режиме продакшн:'),
  //     expect.objectContaining({ bot_name: 'testBot', error: 'prod fail' })
  //   )
  // })
})
