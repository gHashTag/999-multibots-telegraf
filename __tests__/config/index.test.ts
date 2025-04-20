// Clear module cache to apply fresh env settings
beforeEach(() => jest.resetModules())

describe('src/config/index.ts', () => {
  it('exports correct default flags and constants', () => {
    // Import after reset to pick up current process.env
    const config = require('../../src/config')
    // isDev should be false by default in test environment
    expect(config.isDev).toBe(false)
    // Credentials flag false when not set
    expect(config.CREDENTIALS).toBe(false)
    // Supabase configured flag false without env vars
    expect(config.isSupabaseConfigured).toBe(false)
    // NODE_ENV should reflect process.env.NODE_ENV (undefined => undefined)
    expect(config.NODE_ENV).toBeUndefined()
  })
})