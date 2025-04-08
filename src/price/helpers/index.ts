import { MyContext } from '@/interfaces/telegram-bot.interface'
import { getUserBalance } from '@/core/supabase'
import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { isRussian } from '@/helpers'

// Экспортируем только уникальные функции
export * from './modelsCost'
export * from './calculateFinalPrice'
export * from './calculateStars'
export * from './calculateTrainingCost'
export * from './costHelpers'
export * from './handleTrainingCost'
export * from './handleTrainingCostV2'
export * from './imageToPrompt'
export * from './processBalanceVideoOperation'
export * from './refundUser'
export * from './sendBalanceMessage'
export * from './sendCostMessage'
export * from './sendCurrentBalanceMessage'
export * from './sendInsufficientStarsMessage'
export * from './sendPaymentNotification'
export * from './sendPaymentNotificationToUser'
export * from './sendPaymentNotificationWithBot'
export * from './speechCosts'
export * from './starAmounts'
export * from './validateAndCalculateImageModelPrice'
export * from './validateAndCalculateVideoModelPrice'
export * from './voiceConversationCost'

export {
  calculateModeCost,
  ModeEnum,
  starCost,
  SYSTEM_CONFIG,
  calculateCostInStars,
  modeCosts,
  minCost,
  type CostCalculationParams,
  type CostCalculationResult,
} from './modelsCost'

export const processPayment = async ({
  ctx,
  amount,
  type = 'money_expense',
  description,
  metadata = {},
}: {
  ctx: MyContext
  amount: number
  type?: 'money_income' | 'money_expense'
  description?: string
  metadata?: Record<string, any>
}) => {
  try {
    if (!ctx.from?.id) {
      throw new Error('User ID not found')
    }

    const currentBalance = await getUserBalance(
      ctx.from.id.toString(),
      ctx.botInfo.username
    )

    if (!currentBalance || currentBalance < amount) {
      const message = isRussian(ctx)
        ? `❌ Недостаточно средств. Необходимо: ${amount} руб.`
        : `❌ Insufficient funds. Required: ${amount} RUB`

      await ctx.reply(message)

      return {
        success: false,
        error: 'Insufficient funds',
        currentBalance: currentBalance || 0,
        modePrice: amount,
      }
    }

    const newBalance = currentBalance - amount

    // Отправляем событие для обработки платежа
    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: ctx.from.id.toString(),
        amount,
        type,
        description,
        metadata,
        bot_name: ctx.botInfo.username,
      },
    })

    return {
      success: true,
      currentBalance,
      newBalance,
      modePrice: amount,
    }
  } catch (error) {
    logger.error('❌ Ошибка при обработке платежа:', {
      description: 'Error processing payment',
      error: error instanceof Error ? error.message : 'Unknown error',
      modePrice: amount,
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      modePrice: amount,
    }
  }
}
