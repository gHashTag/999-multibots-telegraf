import { TelegramId } from '@/interfaces/telegram.interface'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import {
  getUserBalance,
  updateUserBalance,
  getUserByTelegramId,
} from '@/core/supabase'
import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { Telegram, Telegraf } from 'telegraf'
import { BalanceOperationResult } from '../../interfaces'
import { isRussian } from '@/helpers'
import { v4 as uuidv4 } from 'uuid'

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

export interface ProcessBalanceOperationParams {
  telegram_id: string
  amount: number
  type: string
  description: string
  bot_name: string
  metadata?: Record<string, any>
}

/**
 * Обрабатывает операцию с балансом через событие balance/process
 */
export const processBalanceOperation = async ({
  telegram_id,
  amount,
  type,
  description,
  bot_name,
  metadata = {},
}: ProcessBalanceOperationParams): Promise<number | null> => {
  try {
    logger.info('💰 Начало операции с балансом:', {
      description: 'Starting balance operation',
      telegram_id,
      amount,
      type,
    })

    // Получаем текущий баланс
    const currentBalance = await getUserBalance(telegram_id, bot_name)

    if (!currentBalance) {
      logger.error('❌ Пользователь не найден:', {
        description: 'User not found',
        telegram_id,
      })
      return null
    }

    // Проверяем достаточность средств для списания
    if (type === 'balance_decrease' && currentBalance < Math.abs(amount)) {
      logger.error('❌ Недостаточно средств:', {
        description: 'Insufficient funds',
        telegram_id,
        required: Math.abs(amount),
        available: currentBalance,
      })
      return null
    }

    const operation_id = `${telegram_id}-${Date.now()}-${uuidv4()}`

    // Отправляем событие для обновления баланса
    await inngest.send({
      name: 'balance/process',
      data: {
        telegram_id,
        amount,
        type,
        description,
        bot_name,
        operation_id,
        metadata: {
          ...metadata,
          current_balance: currentBalance,
        },
      },
    })

    // Даем время на обработку события
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Получаем обновленный баланс
    const newBalance = await getUserBalance(telegram_id, bot_name)

    if (!newBalance) {
      logger.error('❌ Не удалось получить обновленный баланс:', {
        description: 'Failed to get updated balance',
        telegram_id,
      })
      return null
    }

    logger.info('✅ Операция с балансом успешно завершена:', {
      description: 'Balance operation completed successfully',
      telegram_id,
      old_balance: currentBalance,
      new_balance: newBalance,
      amount,
      type,
    })

    return newBalance
  } catch (error) {
    logger.error('❌ Ошибка при обработке операции с балансом:', {
      description: 'Error processing balance operation',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id,
      amount,
      type,
    })
    return null
  }
}
