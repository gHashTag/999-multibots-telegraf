import fs from 'fs'
import path from 'path'

// Use isolateModules to reload module for different env setups
describe('config utils', () => {
  beforeEach(() => {
    jest.resetModules()
    // Clear env vars
    delete process.env.BOT_TOKEN
    delete process.env.BOT_TOKENS
    delete process.env.SECRET_KEY
    delete process.env.WEBHOOK_ENABLED
    delete process.env.WEBHOOK_DOMAIN
    delete process.env.WEBHOOK_PATH
    delete process.env.WEBHOOK_PORT
    // Remove test config files
    try { fs.unlinkSync(path.resolve(process.cwd(), 'config', 'testBots.json')) } catch {};
    try { fs.rmdirSync(path.resolve(process.cwd(), 'config'), { recursive: true }) } catch {};
  })

  it('validateToken should reject invalid formats', () => {
    const { validateToken } = require('../../src/utils/config')
    expect(validateToken('')).toBe(false)
    expect(validateToken('no-colon-token')).toBe(false)
    expect(validateToken('123:short')).toBe(false)
    expect(validateToken('abc:abcdefghijklmnopqrstuvwxyz01234')).toBe(false)
  })

  it('validateToken should accept valid token', () => {
    const { validateToken } = require('../../src/utils/config')
    const valid = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi_jklmno'
    expect(validateToken(valid)).toBe(true)
  })

  it('generateSecretKey should return hex string of length 64', () => {
    const { generateSecretKey } = require('../../src/utils/config')
    const key = generateSecretKey()
    expect(typeof key).toBe('string')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('getWebhookConfig should read env variables', () => {
    process.env.WEBHOOK_ENABLED = 'true'
    process.env.WEBHOOK_DOMAIN = 'example.com'
    process.env.WEBHOOK_PATH = '/hook'
    process.env.WEBHOOK_PORT = '8080'
    const { getWebhookConfig } = require('../../src/utils/config')
    const cfg = getWebhookConfig()
    expect(cfg).toEqual({
      enabled: true,
      domain: 'example.com',
      path: '/hook',
      port: 8080,
    })
  })

  describe('loadConfig', () => {
    it('should return no bots if no tokens', () => {
      const { loadConfig } = require('../../src/utils/config')
      const result = loadConfig()
      expect(result.bots).toEqual([])
      expect(result).toHaveProperty('success', 0)
      expect(result).toHaveProperty('failed', 0)
    })

    it('should include BOT_TOKEN env var', () => {
      process.env.BOT_TOKEN = '78910:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi_jklmno'
      const { loadConfig } = require('../../src/utils/config')
      const result = loadConfig()
      expect(result.bots.length).toBe(1)
      expect(result.bots[0].token).toBe(process.env.BOT_TOKEN)
    })
  })

  describe('loadBotsConfig', () => {
    const configDir = path.resolve(process.cwd(), 'config')
    const testPath = path.join('config', 'testBots.json')
    const fullTestPath = path.resolve(process.cwd(), testPath)
    beforeEach(() => {
      fs.mkdirSync(configDir, { recursive: true })
    })
    afterEach(() => {
      try { fs.unlinkSync(fullTestPath) } catch {}
    })

    it('should return empty array when file missing', () => {
      const { loadBotsConfig } = require('../../src/utils/config')
      const result = loadBotsConfig('config/nonexistent.json')
      expect(result).toEqual([])
    })

    it('should disable invalid tokens and duplicates', () => {
      const bots = [
        { name: 'botA', token: 'badtoken', enabled: true },
        { name: 'botA', token: '123:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi_jklmno', enabled: true },
        { name: 'botB', token: '123:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi_jklmno', enabled: true },
      ]
      fs.writeFileSync(fullTestPath, JSON.stringify(bots), 'utf8')
      const { loadBotsConfig } = require('../../src/utils/config')
      const configs = loadBotsConfig(testPath)
      expect(configs.find(b => b.name === 'botA')?.enabled).toBe(false)
      expect(configs.find(b => b.name === 'botB')?.enabled).toBe(true)
    })
  })

  it('loadSecurityConfig should return defaults when no file', () => {
    const { loadSecurityConfig } = require('../../src/utils/config')
    const sec = loadSecurityConfig()
    expect(sec).toHaveProperty('secretKey')
    expect(sec.rateLimit).toHaveProperty('windowMs')
    expect(sec.rateLimit).toHaveProperty('max')
    expect(sec).toHaveProperty('enableIpFilter', false)
  })
})