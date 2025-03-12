import { MyContext } from '@/interfaces'
import { calculateFinalPrice } from '@/price/helpers'
import { findModelByTitle } from '@/menu/videoModelMenu'

export async function validateAndCalculateVideoModelPrice(
  videoModel: string,
  currentBalance: number,
  isRu: boolean,
  ctx: MyContext,
  inputType: 'text' | 'image'
): Promise<{ paymentAmount: number; modelId: string } | null> {
  const modelId = findModelByTitle(videoModel, inputType)
  if (!modelId) {
    await ctx.reply('❌ Модель не найдена')
    return null
  }

  const paymentAmount = calculateFinalPrice(modelId)
  ctx.session.paymentAmount = paymentAmount
  if (currentBalance < paymentAmount) {
    await ctx.reply(
      isRu ? 'Недостаточно средств на балансе' : 'Insufficient balance'
    )
    return null
  }

  return {
    paymentAmount,
    modelId,
  }
}
