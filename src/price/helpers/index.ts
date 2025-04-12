import { TelegramId } from '@/interfaces/telegram.interface'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import {
  getUserBalance,
  updateUserBalance,
  getUserByTelegramIdString,
} from '@/core/supabase'
import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { Telegram, Telegraf } from 'telegraf'
import { BalanceOperationResult } from '../../interfaces'
import { isRussian } from '@/helpers'
import { TransactionType } from '@/interfaces/payments.interface'
import { supabase } from '@/core/supabase'

export { calculateCostInStars, calculateModeCost, calculateCost } from './calculateCost'
export * from './calculateFinalPrice'
export * from './calculateStars'
export * from './costHelpers'
export * from './handleTrainingCost'
export { ModeEnum } from './modelsCost'
export * from './refundUser'
export * from './sendBalanceMessage'
export * from './sendCostMessage'
export * from './sendCurrentBalanceMessage'
export * from './sendInsufficientStarsMessage'
export * from './sendPaymentNotification'
export * from './starAmounts'
export * from './validateAndCalculateImageModelPrice'
export * from './validateAndCalculateVideoModelPrice'
export * from './voiceConversationCost'

export async function processBalanceOperation({
  ctx,
  amount,
  type,
  description,
  metadata,
}: {
  ctx: MyContext
  amount: number
  type: TransactionType
  description: string
  metadata?: Record<string, any>
}): Promise<BalanceOperationResult> {
  if (!ctx.from) {
    throw new Error('User not found')
  }

  try {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', ctx.from.id)
      .single()

    if (userError || !userData) {
      throw new Error('Failed to retrieve user data')
    }

    const currentBalance = userData.balance || 0

    if (currentBalance < amount) {
      const message = isRussian(ctx)
        ? `❌ Недостаточно средств. Необходимо: ${amount} руб.`
        : `❌ Insufficient funds. Required: ${amount} RUB`

      await ctx.reply(message)

      return {
        success: false,
        error: 'Insufficient funds',
        newBalance: currentBalance,
        modePrice: amount,
      }
    }

    const newBalance = currentBalance - amount

    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: ctx.from.id.toString(),
        amount,
        type,
        description,
        metadata,
        bot_name: ctx.botInfo?.username,
      },
    })

    return {
      success: true,
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
      newBalance: 0,
      modePrice: amount,
    }
  }
}

export async function sendBalanceMessage(
  telegram_id: TelegramId,
  newBalance: number | undefined,
  amount: number,
  is_ru: boolean,
  bot: Telegram
) {
  if (typeof newBalance === 'number') {
    const message = is_ru
      ? `⭐️ Цена: ${amount} звезд\n💫 Баланс: ${newBalance} звезд`
      : `⭐️ Price: ${amount} stars\n💫 Balance: ${newBalance} stars`

    bot.sendMessage(telegram_id, message)
  }
}

export const processPayment = async ({
  ctx,
  amount,
  type = TransactionType.MONEY_EXPENSE,
  description,
  metadata = {},
}: {
  ctx: MyContext
  amount: number
  type?: TransactionType.MONEY_INCOME | TransactionType.MONEY_EXPENSE
  description?: string
  metadata?: Record<string, any>
}) => {
  try {
    if (!ctx.from?.id) {
      throw new Error('User ID not found')
    }

    const currentBalance = await getUserBalance(
      ctx.from.id.toString(),
      ctx.botInfo?.username
    )

    if (currentBalance === null || currentBalance < amount) {
      const message = isRussian(ctx)
        ? `❌ Недостаточно средств. Необходимо: ${amount} руб.`
        : `❌ Insufficient funds. Required: ${amount} RUB`

      await ctx.reply(message)
    } else {
      await inngest.send({
        name: 'payment/process',
        data: {
          telegram_id: ctx.from.id.toString(),
          amount,
          type,
          description: description || 'Списание средств',
          metadata,
          bot_name: ctx.botInfo?.username,
        },
      })
    }
  } catch (error) {
    logger.error('❌ Ошибка при обработке платежа (processPayment):', {
      description: 'Error in processPayment',
      error: error instanceof Error ? error.message : 'Unknown error',
      amount,
      userId: ctx.from?.id,
    })
  }
}