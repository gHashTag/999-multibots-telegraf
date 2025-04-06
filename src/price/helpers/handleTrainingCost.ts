import { Markup } from 'telegraf'

import { MyContext } from '@/interfaces'
import { getUserBalance } from '@/core/supabase'

import { calculateCost } from '@/price/priceCalculator'

export async function handleTrainingCost(
  ctx: MyContext,
  steps: number,
  isRu: boolean,
  version: 'v1' | 'v2'
): Promise<{
  leaveScene: boolean
  trainingCostInStars: number
  currentBalance: number
}> {
  const trainingCostInStars = calculateCost(steps, version)
  const currentBalance = await getUserBalance(
    ctx.from?.id.toString() || '',
    ctx.botInfo.username
  )

  let leaveScene = false
  if (currentBalance < trainingCostInStars.stars) {
    const message = isRu
      ? `❌ Недостаточно звезд для обучения модели!\n\nВаш баланс: ${currentBalance}⭐️ звезд, необходимый баланс: ${trainingCostInStars}⭐️ звезд.\n\nПополните баланс вызвав команду /buy.`
      : `❌ Insufficient stars for model training!\n\nYour balance: ${currentBalance}⭐️ stars, required balance: ${trainingCostInStars}⭐️ stars.\n\nTop up your balance by calling the /buy command.`

    await ctx.reply(message, Markup.removeKeyboard())

    leaveScene = true
  }

  return {
    leaveScene,
    trainingCostInStars: trainingCostInStars.stars,
    currentBalance,
  }
}
