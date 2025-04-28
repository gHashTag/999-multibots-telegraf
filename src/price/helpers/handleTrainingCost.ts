import { Markup } from 'telegraf'

import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { getUserBalance } from '@/core/supabase/balance/getUserBalance'
import { logger } from '@/utils/logger'
import { calculateFinalStarPrice } from '@/pricing/calculator'
import { ModeEnum } from '@/interfaces/modes'

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

  const mode =
    version === 'v2' ? ModeEnum.DigitalAvatarBodyV2 : ModeEnum.DigitalAvatarBody
  const costDetails = calculateFinalStarPrice(mode, { steps })

  if (!costDetails) {
    logger.error(
      `handleTrainingCost: Could not calculate price for mode ${mode}, steps ${steps}`
    )
    return { leaveScene: true, trainingCostInStars: 0, currentBalance: 0 }
  }

  const trainingCostInStars = costDetails.stars

  let leaveScene = false
  if (currentBalance < trainingCostInStars) {
    const isRu = isRussian(ctx)
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
