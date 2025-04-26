import type { MyContext } from '@/interfaces'

/**
 * Возвращает токен бота из контекста.
 * @param ctx Контекст Telegraf
 * @returns Токен бота
 */
export function getBotToken(ctx: MyContext): string {
  return ctx.telegram.token
}
