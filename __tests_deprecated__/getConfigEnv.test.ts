import { getConfig, Config } from '../../src/utils/getConfig'

describe('getConfig', () => {
  beforeEach(() => {
    jest.resetModules()
    delete process.env.PORT
    delete process.env.WEBHOOK_URL
    delete process.env.WEBHOOK_SECRET
    delete process.env.NODE_ENV
  })

  it('returns default configuration when env vars are not set', async () => {
    const cfg: Config = await getConfig()
    expect(cfg.PORT).toBe(3000)
    expect(cfg.NODE_ENV).toBe('development')
    expect(cfg.WEBHOOK_URL).toBeUndefined()
    expect(cfg.WEBHOOK_SECRET).toBeUndefined()
  })

  it('parses environment variables correctly', async () => {
    process.env.PORT = '4000'
    process.env.WEBHOOK_URL = 'https://hooks.example'
    process.env.WEBHOOK_SECRET = 'mysecret'
    process.env.NODE_ENV = 'production'
    const cfg: Config = await getConfig()
    expect(cfg.PORT).toBe(4000)
    expect(cfg.NODE_ENV).toBe('production')
    expect(cfg.WEBHOOK_URL).toBe('https://hooks.example')
    expect(cfg.WEBHOOK_SECRET).toBe('mysecret')
  })
})