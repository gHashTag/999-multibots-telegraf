import { Telegraf } from 'telegraf'
import { logger } from '../helpers/logger.mock'

const mockBots: Record<string, Telegraf> = {}

export function registerMockBot(name: string, bot: Telegraf) {
  logger.info('🤖 Регистрация тестового бота', {
    description: 'Registering test bot',
    bot_name: name,
  })
  mockBots[name] = bot
}

export function getMockBot(name: string): Telegraf | undefined {
  const bot = mockBots[name]
  if (!bot) {
    logger.error('❌ Тестовый бот не найден', {
      description: 'Test bot not found',
      bot_name: name,
    })
  }
  return bot
}

export function clearMockBots() {
  Object.keys(mockBots).forEach(key => delete mockBots[key])
}
