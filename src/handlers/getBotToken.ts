import { MyContext } from '@/interfaces'
import { BOT_TOKENS } from '@/core/bot'

/**
 * Возвращает токен бота из контекста.
 * Если токен не найден в контексте или неизвестен, возвращает первый доступный токен.
 * @param ctx Контекст Telegraf
 * @returns Токен бота
 */
export function getBotToken(ctx: MyContext): string {
  // Получаем токен из контекста
  const contextToken = ctx.telegram.token

  // Если токен из контекста найден в массиве BOT_TOKENS, возвращаем его
  if (BOT_TOKENS.includes(contextToken)) {
    return contextToken
  }

  // Иначе возвращаем первый доступный токен
  return BOT_TOKENS[0]
}
