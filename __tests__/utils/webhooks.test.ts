import {
  configureWebhooks,
  removeWebhook,
  WebhookConfig,
} from '../../src/utils/webhooks'
import { botLogger } from '../../src/utils/logger'

describe('configureWebhooks util', () => {
  let bot: any
  let infoSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance
  let warnSpy: jest.SpyInstance
  const botName = 'bot1'
  const config: WebhookConfig = {
    enabled: true,
    domain: 'test.com',
    path: '/hook',
    port: 1234,
  }

  beforeEach(() => {
    jest.resetModules()
    infoSpy = jest.spyOn(botLogger, 'info').mockImplementation(() => {})
    errorSpy = jest.spyOn(botLogger, 'error').mockImplementation(() => {})
    warnSpy = jest.spyOn(botLogger, 'warn').mockImplementation(() => {})
    bot = {
      telegram: {
        setWebhook: jest.fn(),
        getWebhookInfo: jest.fn(),
      },
      botInfo: { username: botName },
    }
  })

  afterEach(() => {
    infoSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('returns false when disabled', async () => {
    const cfg = { ...config, enabled: false }
    const res = await configureWebhooks(bot, cfg, botName)
    expect(res).toBe(false)
    expect(infoSpy).toHaveBeenCalledWith(
      botName,
      'Вебхуки отключены в конфигурации'
    )
  })

  it('returns false when domain missing', async () => {
    const cfg = { ...config, domain: '' }
    const res = await configureWebhooks(bot, cfg, botName)
    expect(res).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(
      botName,
      'Домен для вебхуков не указан'
    )
  })

  it('sets webhook when enabled and domain present', async () => {
    const url = `https://${config.domain}${config.path}`
    bot.telegram.setWebhook.mockResolvedValue({})
    bot.telegram.getWebhookInfo.mockResolvedValue({
      url,
      pending_update_count: 0,
    })
    const res = await configureWebhooks(bot, config, botName)
    expect(res).toBe(true)
    expect(bot.telegram.setWebhook).toHaveBeenCalledWith(url)
    expect(infoSpy).toHaveBeenCalledWith(botName, `Настройка вебхука: ${url}`)
    expect(infoSpy).toHaveBeenCalledWith(
      botName,
      `Вебхук успешно настроен: ${url}`
    )
  })
})

describe('removeWebhook util', () => {
  let bot: any
  let infoSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance
  const botName = 'bot1'

  beforeEach(() => {
    jest.resetModules()
    infoSpy = jest.spyOn(botLogger, 'info').mockImplementation(() => {})
    errorSpy = jest.spyOn(botLogger, 'error').mockImplementation(() => {})
    bot = { telegram: { deleteWebhook: jest.fn() } }
  })

  afterEach(() => {
    infoSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('deletes webhook and logs info', async () => {
    bot.telegram.deleteWebhook.mockResolvedValue({})
    await removeWebhook(bot, botName)
    expect(bot.telegram.deleteWebhook).toHaveBeenCalled()
    expect(infoSpy).toHaveBeenCalledWith(botName, 'Вебхук удален')
  })

  it('logs error on delete failure', async () => {
    bot.telegram.deleteWebhook.mockRejectedValue(new Error('fail'))
    await removeWebhook(bot, botName)
    expect(errorSpy).toHaveBeenCalledWith(
      botName,
      expect.stringContaining('Ошибка при удалении вебхука:')
    )
  })
})
