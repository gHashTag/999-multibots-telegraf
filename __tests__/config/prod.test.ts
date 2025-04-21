describe('config production logging block', () => {
  let logSpy: jest.SpyInstance
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    // Simulate production environment, no Jest context
    process.env.NODE_ENV = 'production'
    delete process.env.JEST_WORKER_ID
    // Remove Supabase env to trigger warning
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('logs token existence and supabase warning in production', () => {
    // Require config to execute top-level logging
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require('../../src/config')
    // Should log token check header
    expect(logSpy).toHaveBeenCalledWith('Bot tokens check in ENV:')
    // Should log existence of BOT_TOKEN_1 (undefined => false)
    expect(logSpy).toHaveBeenCalledWith('BOT_TOKEN_1 exists:', false)
    // Should warn about missing Supabase config
    expect(warnSpy).toHaveBeenCalledWith(
      '⚠️ ВНИМАНИЕ: Не настроены параметры Supabase. Боты будут загружены из переменных окружения.'
    )
    // Exports should reflect production flags
    expect(config.isDev).toBe(false)
    expect(config.isSupabaseConfigured).toBe(false)
  })
})
