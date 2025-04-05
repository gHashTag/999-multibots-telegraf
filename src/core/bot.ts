import { Telegraf } from 'telegraf'
import { TEST_CONFIG } from '@/test-utils/test-config'

export function getBotByName(botName: string) {
  // В тестовом окружении возвращаем мок
  if (process.env.NODE_ENV === 'test') {
    return { bot: TEST_CONFIG.mocks.bot }
  }

  // В реальном окружении возвращаем настоящего бота
  const bot = new Telegraf(process.env[`${botName.toUpperCase()}_BOT_TOKEN`])
  return { bot }
}
