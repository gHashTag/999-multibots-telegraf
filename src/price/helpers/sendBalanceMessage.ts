import bot from '@/core/bot'

export const sendBalanceMessage = async (
  telegram_id: number,
  newBalance: number,
  cost: number,
  isRu: boolean
) => {
  await bot.telegram.sendMessage(
    telegram_id,
    isRu
      ? `Стоимость: ${cost.toFixed(2)} ⭐️\nВаш баланс: ${newBalance.toFixed(
          2
        )} ⭐️`
      : `Cost: ${cost.toFixed(2)} ⭐️\nYour balance: ${newBalance.toFixed(
          2
        )} ⭐️`
  )
}
