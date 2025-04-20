import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
// Mock dotenv to prevent loading .env files during tests
jest.mock('dotenv', () => ({ config: jest.fn(() => ({ parsed: {} })) }))
import { getConfig, Config } from '@/utils/getConfig'

describe('getConfig', () => {
  let originalEnv: NodeJS.ProcessEnv
  beforeEach(() => {
    // Backup original environment
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  it('returns default values when no env vars are set', async () => {
    delete process.env.PORT
    delete process.env.WEBHOOK_URL
    delete process.env.WEBHOOK_SECRET
    delete process.env.NODE_ENV
    const config: Config = await getConfig()
    expect(config).toEqual({
      PORT: 3000,
      WEBHOOK_URL: undefined,
      WEBHOOK_SECRET: undefined,
      NODE_ENV: 'development'
    })
  })

  it('parses PORT and uses provided env vars', async () => {
    process.env.PORT = '4000'
    process.env.WEBHOOK_URL = 'https://example.com/webhook'
    process.env.WEBHOOK_SECRET = 'supersecret'
    process.env.NODE_ENV = 'production'
    const config: Config = await getConfig()
    expect(config.PORT).toBe(4000)
    expect(config.WEBHOOK_URL).toBe('https://example.com/webhook')
    expect(config.WEBHOOK_SECRET).toBe('supersecret')
    expect(config.NODE_ENV).toBe('production')
  })
})