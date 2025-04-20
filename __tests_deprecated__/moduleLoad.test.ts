// Prevent dotenv from loading .env files in tests
jest.mock('dotenv', () => ({ config: jest.fn() }))

// Integration tests for core/bot module initialization and defaults
describe('core/bot module load', () => {
  beforeEach(() => {
    // Reset environment and modules before each test
    jest.resetModules()
    // Clear all BOT_TOKEN environment variables
    delete process.env.BOT_TOKEN_1
    delete process.env.BOT_TOKEN_2
    delete process.env.BOT_TOKEN_3
    delete process.env.BOT_TOKEN_4
    delete process.env.BOT_TOKEN_5
    delete process.env.BOT_TOKEN_6
    delete process.env.BOT_TOKEN_7
    delete process.env.BOT_TOKEN_TEST_1
    delete process.env.BOT_TOKEN_TEST_2
    delete process.env.SUPPORT_CHAT_ID
    delete process.env.NODE_ENV
  })

  it('initializes correctly in production environment', () => {
    // Provide production environment variables
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
    // Import module after setting env
    const {
      DEFAULT_BOT_TOKEN,
      DEFAULT_BOT_NAME,
      BOT_TOKENS,
      PULSE_BOT_TOKEN,
      defaultBot,
      pulseBot,
      bots,
    } = require('@/core/bot')
    // Defaults
    expect(DEFAULT_BOT_TOKEN).toBe('p1')
    expect(DEFAULT_BOT_NAME).toBe('neuro_blogger_bot')
    // BOT_TOKENS should use production tokens
    expect(BOT_TOKENS).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'])
    // bots array should include one instance per production token
    expect(bots).toHaveLength(7)
    // defaultBot should be the first bot
    expect(bots[0]).toBe(defaultBot)
    expect(typeof defaultBot.telegram.sendMessage).toBe('function')
    // Pulse bot token and instance
    expect(PULSE_BOT_TOKEN).toBe('p1')
    expect(pulseBot).toBeDefined()
    expect(typeof pulseBot.telegram.sendMessage).toBe('function')
  })

  it('initializes correctly in non-production environment', () => {
    // Provide test environment variables
    process.env.BOT_TOKEN_1 = 'p1'
    process.env.BOT_TOKEN_2 = 'p2'
    process.env.BOT_TOKEN_3 = 'p3'
    process.env.BOT_TOKEN_4 = 'p4'
    process.env.BOT_TOKEN_5 = 'p5'
    process.env.BOT_TOKEN_6 = 'p6'
    process.env.BOT_TOKEN_7 = 'p7'
    process.env.BOT_TOKEN_TEST_1 = 't1'
    process.env.BOT_TOKEN_TEST_2 = 't2'
    process.env.NODE_ENV = 'development'
    const { BOT_TOKENS, bots } = require('@/core/bot')
    // BOT_TOKENS should use test tokens in development
    expect(BOT_TOKENS).toEqual(['t1', 't2'])
    // bots array should include only test bots
    expect(bots).toHaveLength(2)
  })
})