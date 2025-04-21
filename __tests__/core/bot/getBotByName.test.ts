// Prevent dotenv loading
jest.mock('dotenv', () => ({ config: jest.fn() }))

beforeAll(() => {
  // Provide required BOT_TOKEN env vars for initialization
  process.env.BOT_TOKEN_1 = 'tok1'
  process.env.BOT_TOKEN_2 = 'tok2'
  process.env.BOT_TOKEN_3 = 'tok3'
  process.env.BOT_TOKEN_4 = 'tok4'
  process.env.BOT_TOKEN_5 = 'tok5'
  process.env.BOT_TOKEN_6 = 'tok6'
  process.env.BOT_TOKEN_7 = 'tok7'
  process.env.BOT_TOKEN_TEST_1 = 'tok8'
  process.env.BOT_TOKEN_TEST_2 = 'tok9'
  process.env.NODE_ENV = 'production'
})

afterEach(() => {
  jest.resetModules()
})

describe('getBotByName', () => {
  it('returns error when bot name not in configuration', () => {
    const { getBotByName } = require('@/core/bot')
    const res = getBotByName('unknown_bot')
    expect(res).toHaveProperty('error')
    expect(res.error).toBe('Bot not found in configuration')
    expect(res.bot).toBeUndefined()
  })

  it('returns bot instance when bot name exists', () => {
    const { getBotByName, DEFAULT_BOT_NAME } = require('@/core/bot')
    const res = getBotByName(DEFAULT_BOT_NAME)
    expect(res).toHaveProperty('bot')
    expect(res.bot).toBeDefined()
    // The returned bot should have telegram.sendMessage method
    expect(typeof res.bot.telegram?.sendMessage).toBe('function')
    expect(res.error).toBeUndefined()
  })

  it('recreates bot instance when existing one lacks telegram.sendMessage', () => {
    const mod = require('@/core/bot')
    const { getBotByName, DEFAULT_BOT_NAME, BOT_NAMES, bots } = mod
    const botName = DEFAULT_BOT_NAME
    // Simulate broken bot entry for this name
    const idx = Object.keys(BOT_NAMES).indexOf(botName)
    bots[idx] = {} as any
    const res = getBotByName(botName)
    expect(res.bot).toBeDefined()
    expect(typeof res.bot.telegram?.sendMessage).toBe('function')
    // Ensure the bots array has been replaced with the new instance
    expect(bots[idx]).toBe(res.bot)
    expect(res.error).toBeUndefined()
  })
})
