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

export * from './modelsCost'
export * from './calculateFinalPrice'
export * from './calculateStars'
export * from './sendInsufficientStarsMessage'
export * from './sendPaymentNotification'
export * from './sendCostMessage'
export * from './sendCurrentBalanceMessage'
export * from './sendBalanceMessage'
export * from './refundUser'
export * from './validateAndCalculateVideoModelPrice'
export * from './validateAndCalculateImageModelPrice'
export * from './handleTrainingCost'
export * from './sendPaymentNotificationWithBot'
export { starAmounts } from './starAmounts'
export { voiceConversationCost } from './voiceConversationCost'
export { convertRublesToStars } from './costHelpers'

export async function processBalanceOperation({
  telegram_id,
  amount,
  is_ru,
  bot,
  bot_name,
  description,
  type,
}: {
  telegram_id: TelegramId
  amount: number
  is_ru: boolean
  bot: Telegraf<MyContext>
  bot_name: string
  description: string
  type: string
}): Promise<BalanceOperationResult> {
  try {
    const user = await getUserByTelegramIdString(telegram_id)
    if (!user) {
      throw new Error(`User with ID ${telegram_id} not found`)
    }

    const currentBalance = user.balance || 0
    if (currentBalance < amount) {
      const message = is_ru
        ? `❌ Недостаточно средств. Необходимо: ${amount} руб.`
        : `❌ Insufficient funds. Required: ${amount} RUB`

      bot.telegram.sendMessage(telegram_id, message)
      return {
        success: false,
        error: 'Insufficient funds',
        newBalance: currentBalance,
        modePrice: amount,
      }
    }

    const newBalance = currentBalance - amount
    await updateUserBalance({
      telegram_id,
      amount: amount,
      type: 'money_expense',
      description: description,
      bot_name,
    })

    logger.info({
      message: '💰 Операция с балансом выполнена',
      description: 'Balance operation completed',
      telegram_id,
      type,
      amount,
      oldBalance: currentBalance,
      newBalance,
    })

    return {
      success: true,
      newBalance,
      modePrice: amount,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при обработке платежа',
      description: 'Payment processing error',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
      type,
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
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
