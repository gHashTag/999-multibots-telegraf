import { MyContext } from '@/interfaces'
import { Telegraf } from 'telegraf'

export const sendBalanceMessage = async (
  ctxOrTelegramId: MyContext | string,
  newBalance: number,
  cost: number,
  isRu: boolean,
  bot?: Telegraf<MyContext>
) => {
  if (typeof ctxOrTelegramId === 'string') {
    // Вариант с telegram_id
    const telegramId = ctxOrTelegramId

    if (!bot) {
      console.error('🔥 Ошибка в sendBalanceMessage:', {
        description: 'Bot instance is required when using telegram_id',
      })
      return
    }

    await bot.telegram.sendMessage(
      telegramId,
      isRu
        ? `Стоимость: ${cost.toFixed(2)} ⭐️\nВаш баланс: ${newBalance.toFixed(
            2
          )} ⭐️`
        : `Cost: ${cost.toFixed(2)} ⭐️\nYour balance: ${newBalance.toFixed(
            2
          )} ⭐️`
    )
  } else {
    // Оригинальный вариант с MyContext
    const ctx = ctxOrTelegramId

    await ctx.telegram.sendMessage(
      ctx.from?.id?.toString() || '',
      isRu
        ? `Стоимость: ${cost.toFixed(2)} ⭐️\nВаш баланс: ${newBalance.toFixed(
            2
          )} ⭐️`
        : `Cost: ${cost.toFixed(2)} ⭐️\nYour balance: ${newBalance.toFixed(
            2
          )} ⭐️`
    )
  }
}
