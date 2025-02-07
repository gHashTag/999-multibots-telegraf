import { MyContext } from '@/interfaces'

export const sendBalanceMessage = async (
  ctx: MyContext,
  newBalance: number,
  cost: number,
  isRu: boolean
) => {
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
