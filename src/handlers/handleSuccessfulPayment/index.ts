import { Context } from 'telegraf'
import { getBotNameByToken, setSuccessfulPayment } from '@/core'
import { MyContext } from '@/interfaces'

export async function handlePreCheckoutQuery(ctx: Context) {
  await ctx.answerPreCheckoutQuery(true)
}

/**
 * Обработчик успешных платежей Telegram Stars.
 *
 * @param ctx - Контекст Telegraf.
 */
export async function handleSuccessfulPayment(ctx: MyContext) {
  // ... existing code ...
}
