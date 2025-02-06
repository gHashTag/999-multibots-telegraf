import bot from '@/core/bot'

export const sendCostMessage = async (
  telegram_id: number,
  cost: number,
  isRu: boolean
) => {
  await bot.telegram.sendMessage(
    telegram_id,
    isRu ? `Стоимость: ${cost.toFixed(2)} ⭐️` : `Cost: ${cost.toFixed(2)} ⭐️`
  )
  return
}
