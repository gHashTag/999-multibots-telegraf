import { MyContext } from '@/interfaces'

import { calculateTrainingCost } from './calculateTrainingCost'
import { getUserBalance } from '@/core/supabase'

export async function handleTrainingCostV2(
  ctx: MyContext,
  steps: number,
  isRu: boolean,
  version: 'v1' | 'v2'
): Promise<{
  leaveScene: boolean
  trainingCostInStars: number
  currentBalance: number
}> {
  const telegram_id = ctx.from?.id?.toString() || ''
  const currentBalance = await getUserBalance(telegram_id, ctx.botInfo.username)
  const trainingCostInStars = calculateTrainingCost(steps, version)

  if (currentBalance < trainingCostInStars) {
    await ctx.reply(
      isRu
        ? `❌ Недостаточно звезд для обучения модели.\n\nСтоимость: ${trainingCostInStars}⭐️\nВаш баланс: ${currentBalance}⭐️\n\nПожалуйста, пополните баланс.`
        : `❌ Insufficient stars for model training.\n\nCost: ${trainingCostInStars}⭐️\nYour balance: ${currentBalance}⭐️\n\nPlease top up your balance.`
    )
    return { leaveScene: true, trainingCostInStars, currentBalance }
  }

  return { leaveScene: false, trainingCostInStars, currentBalance }
}
