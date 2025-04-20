import { jest, describe, beforeAll, afterEach, it, expect } from '@jest/globals'

// Mock supabase function
jest.mock('@/core/supabase', () => ({
  getBotGroupFromAvatars: jest.fn().mockResolvedValue('group1'),
}))

beforeAll(() => {
  // Provide required environment variables
  process.env.BOT_TOKEN_1 = 't1'
  process.env.BOT_TOKEN_2 = 't2'
  process.env.BOT_TOKEN_3 = 't3'
  process.env.BOT_TOKEN_4 = 't4'
  process.env.BOT_TOKEN_5 = 't5'
  process.env.BOT_TOKEN_6 = 't6'
  process.env.BOT_TOKEN_7 = 't7'
  process.env.BOT_TOKEN_TEST_1 = 't8'
  process.env.BOT_TOKEN_TEST_2 = 't9'
  process.env.NODE_ENV = 'production'
})

afterEach(() => {
  jest.resetModules()
})

describe('createBotByName', () => {
  it('returns token, groupId and bot for valid bot name', async () => {
    const { createBotByName, getTokenByBotName } = require('@/core/bot')
    const botName = 'neuro_blogger_bot'
    const result = await createBotByName(botName)
    expect(result).toBeDefined()
    expect(result!.token).toBe(getTokenByBotName(botName))
    expect(result!.groupId).toBe('group1')
    expect(result!.bot.telegram).toBeDefined()
    expect(typeof result!.bot.telegram.sendMessage).toBe('function')
  })

  it('returns undefined for invalid bot name', async () => {
    const { createBotByName } = require('@/core/bot')
    const result = await createBotByName('InvalidBot')
    expect(result).toBeUndefined()
  })
  
  it('returns undefined and logs error when bot instance not found', async () => {
    // Reload module to get fresh bots array
    const mod = require('@/core/bot')
    const { createBotByName, BOT_NAMES, bots } = mod
    const botName = 'neuro_blogger_bot'
    // Remove bot instance to simulate missing bot
    const idx = Object.keys(BOT_NAMES).indexOf(botName)
    bots[idx] = undefined as any
    // Spy on logger.error
    const logger = require('@/utils/logger')
    const spyErr = jest.spyOn(logger, 'error').mockImplementation(() => {})
    const result = await createBotByName(botName)
    expect(result).toBeUndefined()
    expect(spyErr).toHaveBeenCalledWith(
      '❌ Экземпляр бота не найден:',
      expect.objectContaining({ botName })
    )
    spyErr.mockRestore()
  })
})