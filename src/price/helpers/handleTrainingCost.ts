import { Markup } from 'telegraf'

import { type MyContext, type Subscription } from '@/interfaces'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { getUserDetailsSubscription } from '@/core/supabase/getUserDetailsSubscription'
import { calculateCostInStars } from './calculateTrainingCost'
import { conversionRates } from '@/price/priceCalculator'
import { logger } from '@/utils/logger'
import { calculateCost } from '@/price/priceCalculator'
import { ModelsConfig } from '@/interfaces/models.interface'
import { calculateFinalPrice } from './calculateFinalPrice'

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

  let leaveScene = false
  if (currentBalance < trainingCostInStars) {
    const message = isRu
      ? `❌ Недостаточно звезд для обучения модели!\n\nВаш баланс: ${currentBalance}⭐️ звезд, необходимый баланс: ${trainingCostInStars}⭐️ звезд.\n\nПополните баланс вызвав команду /buy.`
      : `❌ Insufficient stars for model training!\n\nYour balance: ${currentBalance}⭐️ stars, required balance: ${trainingCostInStars}⭐️ stars.\n\nTop up your balance by calling the /buy command.`

    await ctx.reply(message, Markup.removeKeyboard())

    leaveScene = true
  }

  return {
    leaveScene,
    trainingCostInStars,
    currentBalance,
  }
}
