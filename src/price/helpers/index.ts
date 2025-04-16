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
import { isRussian } from '@/helpers'
import { TransactionType } from '@/interfaces/payments.interface'
import { BalanceOperationResult } from '@/interfaces/balance.interface'

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

export * from './processBalanceVideoOperation'
export * from './processBalanceOperation'
export * from './processPayment'


      bot.telegram.sendMessage(telegram_id, message)
      return {
        success: false,
        message: 'Insufficient funds',
        balance: currentBalance,
        error: 'Insufficient funds',
      }
    }

    const newBalance = currentBalance - amount
    await updateUserBalance({
      telegram_id,
      amount: amount,
      type: TransactionType.MONEY_EXPENSE,
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
      message: 'Balance operation completed successfully',
      balance: newBalance,
    }
  } catch (error) {
    console.error('Error in processBalanceOperation:', error)
    return {
      success: false,
      message:
        error instanceof Error ? error.message : 'Balance operation failed',
      balance: 0,
      error: error instanceof Error ? error : new Error('Unknown error'),
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
      ctx.botInfo.username
    )

    if (!currentBalance || currentBalance < amount) {
      const message = isRussian(ctx)
        ? `❌ Недостаточно средств. Необходимо: ${amount} руб.`
        : `❌ Insufficient funds. Required: ${amount} RUB`

      await ctx.reply(message)

      return {
        success: false,
        message: 'Insufficient funds',
        balance: currentBalance || 0,
        error: 'Insufficient funds',
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
      message: 'Balance operation completed successfully',
      balance: newBalance,
    }
  } catch (error) {
    console.error('Error in processPayment:', error)
    return {
      success: false,
      message:
        error instanceof Error ? error.message : 'Balance operation failed',
      balance: 0,
      error: error instanceof Error ? error : new Error('Unknown error'),
    }
  }
}
