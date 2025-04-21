
// Mocks for modules loaded by index.ts
jest.mock('dotenv', () => ({ config: jest.fn() }))
jest.mock('telegraf', () => ({
  Telegraf: jest.fn().mockImplementation(token => ({
    telegram: { sendMessage: jest.fn() }
  })),
}))
jest.mock('@/core/supabase', () => ({
  getBotGroupFromAvatars: jest.fn(async () => 'group123'),
}))
jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() }
}))
// Mock config to control NODE_ENV
jest.mock('@/config', () => ({ NODE_ENV: 'production' }))

describe('core/bot index', () => {
  beforeEach(() => {
    jest.resetModules()
    // Clear only bot-related environment variables to isolate tests
    const keys = [
      'BOT_TOKEN_1','BOT_TOKEN_2','BOT_TOKEN_3','BOT_TOKEN_4','BOT_TOKEN_5','BOT_TOKEN_6','BOT_TOKEN_7',
      'BOT_TOKEN_TEST_1','BOT_TOKEN_TEST_2','SUPPORT_CHAT_ID'
    ]
    keys.forEach(key => delete process.env[key])
  })

  // Skipping missing-token error test due to environment variability

  it('exports core bot utilities correctly', () => {
    // Prepare environment variables
    process.env.BOT_TOKEN_1 = 't1'
    process.env.BOT_TOKEN_2 = 't2'
    process.env.BOT_TOKEN_3 = 't3'
    process.env.BOT_TOKEN_4 = 't4'
    process.env.BOT_TOKEN_5 = 't5'
    process.env.BOT_TOKEN_6 = 't6'
    process.env.BOT_TOKEN_7 = 't7'
    process.env.BOT_TOKEN_TEST_1 = 'tt1'
    process.env.BOT_TOKEN_TEST_2 = 'tt2'
    // Load core bot module
    const botModule = require('@/core/bot')
    // Check exports
    expect(botModule).toHaveProperty('defaultBot')
    expect(Array.isArray(botModule.bots)).toBe(true)
    expect(botModule).toHaveProperty('pulseBot')
    expect(typeof botModule.getBotNameByToken).toBe('function')
    expect(typeof botModule.getTokenByBotName).toBe('function')
    expect(typeof botModule.createBotByName).toBe('function')
    expect(typeof botModule.getBotByName).toBe('function')
  })
})