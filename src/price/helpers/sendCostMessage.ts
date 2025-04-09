import { MyContext } from '@/types'

export const sendCostMessage = async (
  ctx: MyContext,
  cost: number,
  isRu: boolean
) => {
  await ctx.telegram.sendMessage(
    ctx.from?.id?.toString() || '',
    isRu ? `Стоимость: ${cost.toFixed(2)} ⭐️` : `Cost: ${cost.toFixed(2)} ⭐️`
  )
  return
}
