import { Markup } from 'telegraf'

import { MyContext } from '@/interfaces'
import { getUserBalance } from '@/core/supabase'
import { calculateCostInStars, conversionRates } from './calculateTrainingCost'

export async function handleTrainingCost(
  ctx: MyContext,
  steps: number,
  isRu: boolean
): Promise<{
  leaveScene: boolean
  trainingCostInStars: number
  currentBalance: number
}> {
  const trainingCostInStars = calculateCostInStars(steps, conversionRates)
  const currentBalance = await getUserBalance(Number(ctx.from?.id))

  let leaveScene = false
  if (currentBalance < trainingCostInStars) {
    const message = isRu
      ? `❌ Недостаточно звезд для обучения модели!\n\nВаш баланс: ${currentBalance}⭐️ звезд, необходимый баланс: ${trainingCostInStars}⭐️ звезд.\n\nПополните баланс вызвав команду /buy.`
      : `❌Insufficient stars for model training!\n\nYour balance: ${currentBalance}⭐️ stars, required balance: ${trainingCostInStars}⭐️ stars.\n\nTop up your balance by calling the /buy command.`

    await ctx.reply(message, Markup.removeKeyboard())

    leaveScene = true
  }

  return {
    leaveScene,
    trainingCostInStars,
    currentBalance,
  }
}
