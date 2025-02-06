import bot from '@/core/bot'

export const sendCurrentBalanceMessage = async (
  telegram_id: number,
  isRu: boolean,
  currentBalance: number
) => {
  await bot.telegram.sendMessage(
    telegram_id,
    isRu
      ? `Ваш баланс: ${currentBalance.toFixed(2)} ⭐️`
      : `Your current balance: ${currentBalance.toFixed(2)} ⭐️`
  )
  return
}
