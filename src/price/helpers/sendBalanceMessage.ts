import { MyContext } from '@/interfaces'
import { getBotByName } from '@/core/bot'
import { BotName } from '@/interfaces/telegram-bot.interface'
export const sendBalanceMessage = async (
  ctx: MyContext,
  newBalance: number,
  cost: number,
  isRu: boolean,
  bot_name: string
) => {
  try {
    const { bot } = getBotByName(bot_name as BotName)
    if (!bot) {
      console.error(`Bot instance not found for name: ${bot_name}`)
      throw new Error('Bot instance not found')
    }

    const chatId = ctx.from?.id?.toString()
    if (!chatId) {
      console.error('Chat ID not found for balance message')
      return
    }

    const message = isRu
      ? `Стоимость: ${cost.toFixed(2)} ⭐️\nВаш баланс: ${newBalance.toFixed(2)} ⭐️`
      : `Cost: ${cost.toFixed(2)} ⭐️\nYour balance: ${newBalance.toFixed(2)} ⭐️`

    await bot.telegram.sendMessage(chatId, message)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Проверяем, является ли это ошибкой "chat not found"
    if (errorMessage.includes('chat not found')) {
      console.warn('⚠️ Chat not found - user may have blocked bot or deleted chat:', {
        bot_name,
        chatId: ctx.from?.id,
        cost,
        balance: newBalance,
        note: 'This is not critical - main functionality continues'
      })
    } else {
      console.error('❌ Error sending balance message:', {
        error: errorMessage,
        bot_name,
        chatId: ctx.from?.id,
        cost,
        balance: newBalance,
      })
    }
    // Не выбрасываем ошибку, чтобы не прерывать основной поток
  }
}
