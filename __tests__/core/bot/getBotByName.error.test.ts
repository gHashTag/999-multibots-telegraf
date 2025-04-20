
// Prevent dotenv loading
jest.mock('dotenv', () => ({ config: jest.fn() }))

describe('getBotByName error handling', () => {
  afterEach(() => {
    jest.resetModules()
  })

  it('returns error when recreated bot instance lacks telegram.sendMessage', () => {
    jest.isolateModules(() => {
      // Set minimal environment for module load
      process.env.BOT_TOKEN_1 = 'p1'
      process.env.BOT_TOKEN_2 = 'p2'
      process.env.BOT_TOKEN_3 = 'p3'
      process.env.BOT_TOKEN_4 = 'p4'
      process.env.BOT_TOKEN_5 = 'p5'
      process.env.BOT_TOKEN_6 = 'p6'
      process.env.BOT_TOKEN_7 = 'p7'
      process.env.BOT_TOKEN_TEST_1 = 't1'
      process.env.BOT_TOKEN_TEST_2 = 't2'
      process.env.NODE_ENV = 'production'
      // Mock Telegraf so new instance has no telegram property
      jest.doMock('telegraf', () => ({
        Telegraf: jest.fn().mockImplementation(() => ({})),
      }))
      const { getBotByName, DEFAULT_BOT_NAME, BOT_NAMES, bots } = require('@/core/bot')
      const idx = Object.keys(BOT_NAMES).indexOf(DEFAULT_BOT_NAME)
      // Break existing default bot instance to trigger recreation logic
      bots[idx] = {} as any
      const result = getBotByName(DEFAULT_BOT_NAME)
      expect(result.error).toBe('Bot initialization failed')
      expect(result.bot).toBeUndefined()
    })
  })
})