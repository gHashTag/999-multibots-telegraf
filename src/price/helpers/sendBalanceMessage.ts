import { type MyContext } from '@/interfaces'
import { getBotByName } from '@/core/bot'
import { type BotName } from '@/interfaces/telegram-bot.interface'

export const sendBalanceMessage = async (
  ctx: MyContext,
  newBalance: number,
  cost: number,
  isRu: boolean,
  bot_name: string
) => {
  const { bot } = getBotByName(bot_name as BotName)
  if (!bot) {
    console.error(`Bot instance not found for name: ${bot_name}`)
    throw new Error('Bot instance not found')
  }
  await bot.telegram.sendMessage(
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
