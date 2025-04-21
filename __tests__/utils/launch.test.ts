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

describe('Launch Utilities', () => {
  let bot: any
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...OLD_ENV }
    // Bot stub
    bot = {
      telegram: {
        deleteWebhook: jest.fn().mockResolvedValue(undefined),
        getMe: jest.fn().mockResolvedValue({}),
        setWebhook: jest.fn().mockResolvedValue(undefined),
        getWebhookInfo: jest.fn().mockResolvedValue({
          url: 'https://test/hook',
          pending_update_count: 0,
        }),
      },
      launch: jest.fn().mockResolvedValue(undefined),
      handleUpdate: jest.fn().mockResolvedValue(undefined),
      botInfo: { username: 'testBot' },
    }
  })

  it('development: deletes webhook and launches bot, logs info', async () => {
    await expect(development(bot)).resolves.toBeUndefined()
    expect(bot.telegram.deleteWebhook).toHaveBeenCalledTimes(1)
    expect(bot.launch).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('✅ Бот запущен в режиме разработки:'),
      expect.objectContaining({ bot_name: 'testBot' })
    )
  })

  it('development: logs error and rethrows on failure', async () => {
    const err = new Error('fail')
    bot.launch.mockRejectedValueOnce(err)
    await expect(development(bot)).rejects.toThrow('fail')
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('❌ Ошибка запуска бота в режиме разработки:'),
      expect.objectContaining({ bot_name: 'testBot', error: 'fail' })
    )
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
