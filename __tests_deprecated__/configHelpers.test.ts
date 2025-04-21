// Mocks for file system operations
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

jest.mock('fs')
jest.mock('path', () => ({ resolve: (p: string) => p }))
jest.mock('dotenv', () => ({ parse: jest.fn(), config: jest.fn() }))

describe('config utilities', () => {
  const VALID_TOKEN1 = '100:' + 'A'.repeat(30)
  const VALID_TOKEN2 = '200:' + 'B'.repeat(30)

  beforeEach(() => {
    jest.resetModules()
    process.env = {}
    ;(fs.existsSync as jest.Mock).mockReturnValue(false)
    ;(fs.readFileSync as jest.Mock).mockReturnValue('')
    ;(fs.readdirSync as jest.Mock).mockReturnValue([])
  })

  it('getWebhookConfig reads env vars correctly', () => {
    process.env.WEBHOOK_ENABLED = 'true'
    process.env.WEBHOOK_DOMAIN = 'example.com'
    process.env.WEBHOOK_PATH = '/hook'
    process.env.WEBHOOK_PORT = '8080'
    const { getWebhookConfig } = require('@/utils/config')
    const cfg = getWebhookConfig()
    expect(cfg).toEqual({
      enabled: true,
      domain: 'example.com',
      path: '/hook',
      port: 8080,
    })
  })

  it('getBotTokens returns empty and logs error when no tokens found', () => {
    const logger = require('@/utils/logger')
    const { getBotTokens } = require('@/utils/config')
    const tokens = getBotTokens()
    expect(tokens).toEqual([])
    expect(logger.botLogger.error).toHaveBeenCalledWith(
      'Config',
      'Не найдено ни одного валидного токена. Проверьте конфигурацию.'
    )
  })

  it('getBotTokens collects valid BOT_TOKEN env var', () => {
    process.env.BOT_TOKEN = VALID_TOKEN1
    const { getBotTokens } = require('@/utils/config')
    const tokens = getBotTokens()
    expect(tokens).toEqual([VALID_TOKEN1])
  })

  it('getBotTokens collects tokens from BOT_TOKENS env var', () => {
    process.env.BOT_TOKENS = VALID_TOKEN1 + ',' + VALID_TOKEN2
    const { getBotTokens } = require('@/utils/config')
    const tokens = getBotTokens()
    expect(tokens).toEqual([VALID_TOKEN1, VALID_TOKEN2])
  })

  it('loadConfig uses getBotTokens and returns bots array', () => {
    process.env.BOT_TOKENS = VALID_TOKEN1 + ' ' + VALID_TOKEN2
    process.env.WEBHOOK_ENABLED = 'false'
    process.env.WEBHOOK_DOMAIN = ''
    process.env.WEBHOOK_PATH = '/w'
    process.env.WEBHOOK_PORT = '9000'
    const configModule = require('@/utils/config')
    // Override logging to silence
    const result = configModule.loadConfig()
    expect(result.bots).toHaveLength(2)
    expect(result.bots[0]).toEqual({ id: 'bot1', token: VALID_TOKEN1 })
    expect(result.bots[1]).toEqual({ id: 'bot2', token: VALID_TOKEN2 })
    expect(result.webhookConfig).toEqual({
      enabled: false,
      domain: '',
      path: '/w',
      port: 9000,
    })
  })
})
