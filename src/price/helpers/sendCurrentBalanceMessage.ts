import { TelegramId } from '@/interfaces/telegram.interface'
import { MyContext } from '@/interfaces'

export const sendCurrentBalanceMessage = async (
  ctx: MyContext,
  telegram_id: TelegramId,
  isRu: boolean,
  currentBalance: number
) => {
  await ctx.telegram.sendMessage(
    telegram_id,
    isRu
      ? `Ваш баланс: ${currentBalance.toFixed(2)} ⭐️`
      : `Your current balance: ${currentBalance.toFixed(2)} ⭐️`
  )
  return
}
