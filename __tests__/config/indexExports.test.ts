describe('config index exports', () => {
  beforeEach(() => {
    jest.resetModules()
    // Clear relevant env vars
    delete process.env.NODE_ENV
    delete process.env.JEST_WORKER_ID
    delete process.env.CREDENTIALS
    delete process.env.PORT
    delete process.env.WEBHOOK_URL
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('defaults CREDENTIALS to false and NODE_ENV undefined', () => {
    const config = require('../../src/config')
    expect(config.CREDENTIALS).toBe(false)
    expect(config.NODE_ENV).toBeUndefined()
  })

  it('parses CREDENTIALS from env', () => {
    process.env.CREDENTIALS = 'true'
    const config = require('../../src/config')
    expect(config.CREDENTIALS).toBe(true)
  })

  it('exports PORT and WEBHOOK_URL when set', () => {
    process.env.PORT = '1234'
    process.env.WEBHOOK_URL = 'https://hook.test'
    const config = require('../../src/config')
    expect(config.PORT).toBe('1234')
    expect(config.WEBHOOK_URL).toBe('https://hook.test')
  })

  it('sets isSupabaseConfigured to true when all supabase vars are present', () => {
    process.env.SUPABASE_URL = 'url'
    process.env.SUPABASE_SERVICE_KEY = 'key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'role'
    const config = require('../../src/config')
    expect(config.isSupabaseConfigured).toBe(true)
  })

  it('sets isSupabaseConfigured to false when supabase vars missing', () => {
    process.env.SUPABASE_URL = 'url'
    // missing SERVICE_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'role'
    const config = require('../../src/config')
    expect(config.isSupabaseConfigured).toBe(false)
  })
})
