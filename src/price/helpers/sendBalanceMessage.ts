import { MyContext } from '@/types'
import { Telegram } from 'telegraf/typings/telegram'

export const sendBalanceMessage = async (
  ctxOrTelegramId: MyContext | string,
  newBalance: number,
  cost: number,
  isRu: boolean,
  bot?: Telegram
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

    const messageText = isRu
      ? `Стоимость: ${cost.toFixed(2)} ⭐️\nВаш баланс: ${newBalance.toFixed(
          2
        )} ⭐️`
      : `Cost: ${cost.toFixed(2)} ⭐️\nYour balance: ${newBalance.toFixed(
          2
        )} ⭐️`

    await bot.sendMessage(telegramId, messageText)
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
