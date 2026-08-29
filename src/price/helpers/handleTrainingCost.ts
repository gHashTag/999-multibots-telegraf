import { Markup } from 'telegraf'

import { MyContext, Subscription } from '@/interfaces'
import { getUserBalance } from '@/core/supabase'
import { calculateCostInStars } from './calculateTrainingCost'
import { conversionRates } from '@/price/priceCalculator'
import { logger } from '@/utils/logger'
import { calculateCost } from '@/price/priceCalculator'

type TrainingCostProps = {
  ctx: MyContext
  steps: number
  isRu: boolean
  version?: 'v1' | 'v2'
}

export const handleTrainingCost = async (
  ctx: MyContext,
  steps: number,
  isRu: boolean,
  version: 'v1' | 'v2' = 'v1'
): Promise<{
  leaveScene: boolean
  trainingCostInStars: number
  currentBalance: number
}> => {
  if (!ctx.from?.id) {
    logger.error('handleTrainingCost: User ID not found in context')
    return { leaveScene: true, trainingCostInStars: 0, currentBalance: 0 }
  }
  const currentBalance = await getUserBalance(ctx.from.id.toString())
  const cost = calculateCost(steps, version)
  const trainingCostInStars = cost.stars

  // A training must cost something. Both training wizards parse `steps` from
  // free-typed text with no allowlist; steps=0 makes trainingCostInStars 0, and
  // the balance gate below degenerates to `currentBalance < 0` (always false),
  // letting a FREE paid training through at the owner's expense. Reject any
  // non-positive price up front (0/negative/NaN). Class: 0-cost pricing bypass.
  if (!(trainingCostInStars > 0)) {
    const message = isRu
      ? '❌ Выберите количество шагов кнопкой ниже.'
      : '❌ Please choose the number of steps below.'
    await ctx.reply(message, Markup.removeKeyboard())
    return { leaveScene: true, trainingCostInStars, currentBalance }
  }

  let leaveScene = false
  if (currentBalance < trainingCostInStars) {
    const message = isRu
      ? `❌ Недостаточно звезд для обучения модели!\n\nВаш баланс: ${currentBalance}⭐️ звезд, необходимый баланс: ${trainingCostInStars}⭐️ звезд.\n\nПополните баланс в главном меню.`
      : `❌ Insufficient stars for model training!\n\nYour balance: ${currentBalance}⭐️ stars, required balance: ${trainingCostInStars}⭐️ stars.\n\nTop up your balance in the main menu.`

    await ctx.reply(message, Markup.removeKeyboard())

    leaveScene = true
  }

  return {
    leaveScene,
    trainingCostInStars,
    currentBalance,
  }
}
