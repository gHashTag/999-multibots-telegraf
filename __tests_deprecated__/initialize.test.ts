// Mock dotenv to prevent real .env loading
jest.mock('dotenv', () => ({ config: jest.fn() }))
// Spy on logger to suppress and verify info calls
import { logger } from '@/utils/logger'
const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {})

describe('core/bot module initialization and exports', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    // Clear env before each test
    process.env = {}
  })

  it('loads basic exports and initializes bots in production', () => {
    // Provide all required environment variables
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
    process.env.SUPPORT_CHAT_ID = 'support123'
    // Load module to execute top-level initialization
    jest.isolateModules(() => {
      const coreBot = require('@/core/bot')
      // Check default exports
      expect(coreBot.DEFAULT_BOT_NAME).toBe('neuro_blogger_bot')
      expect(coreBot.DEFAULT_BOT_TOKEN).toBe('p1')
      // BOT_URLS should contain known bot keys
      expect(coreBot.BOT_URLS).toHaveProperty('neuro_blogger_bot')
      // BOT_TOKENS array length should match production tokens
      expect(coreBot.BOT_TOKENS).toEqual([
        'p1',
        'p2',
        'p3',
        'p4',
        'p5',
        'p6',
        'p7',
      ])
      // bots array should instantiate 7 bots
      expect(Array.isArray(coreBot.bots)).toBe(true)
      expect(coreBot.bots).toHaveLength(7)
      // pulseBot should be defined and have sendMessage
      expect(coreBot.pulseBot).toBeDefined()
      expect(typeof coreBot.pulseBot.telegram.sendMessage).toBe('function')
      // logger.info should have been called at least once
      expect(infoSpy).toHaveBeenCalled()
    })
  })
})
