import { MyContext } from '@/interfaces'
import { BOT_TOKENS, BOT_NAMES } from '@/core/bot'

export function getBotToken(ctxOrBotName: MyContext | string): string {
  // Если передан контекст
  if (typeof ctxOrBotName !== 'string') {
    const botToken = ctxOrBotName.telegram.token
    return botToken || BOT_TOKENS[0]
  }

  // Если передано имя бота
  const botName = ctxOrBotName

  // Проверяем, есть ли бот с таким именем в объекте BOT_NAMES
  const botTokens = Object.entries(BOT_NAMES)
  const foundBot = botTokens.find(([name]) => name === botName)

  // Если бот найден, возвращаем его токен
  if (foundBot) {
    return foundBot[1] as string // Возвращаем токен бота
  }

  // По умолчанию возвращаем токен первого бота
  return BOT_TOKENS[0]
}
