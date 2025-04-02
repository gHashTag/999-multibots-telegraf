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

import { Telegraf, Telegram } from 'telegraf'
import { MyContext, BalanceOperationResult } from '../../interfaces'
import { logger } from '../../utils/logger'
import { getUserByTelegramId, updateUserBalance } from '../../core/supabase'

export async function processBalanceOperation({
  telegram_id,
  paymentAmount,
  is_ru,
  bot,
  bot_name,
  description,
  type,
}: {
  telegram_id: string
  paymentAmount: number
  is_ru: boolean
  bot: Telegraf<MyContext>
  bot_name: string
  description: string
  type: string
}): Promise<BalanceOperationResult> {
  try {
    const user = await getUserByTelegramId(telegram_id)
    if (!user) {
      throw new Error(`User with ID ${telegram_id} not found`)
    }

    const currentBalance = user.balance || 0
    if (currentBalance < paymentAmount) {
      const message = is_ru
        ? `❌ Недостаточно средств. Необходимо: ${paymentAmount} руб.`
        : `❌ Insufficient funds. Required: ${paymentAmount} RUB`

      bot.telegram.sendMessage(telegram_id, message)
      return {
        success: false,
        error: 'Insufficient funds',
        newBalance: currentBalance,
        modePrice: paymentAmount,
      }
    }

    const newBalance = currentBalance - paymentAmount
    await updateUserBalance({
      telegram_id,
      amount: paymentAmount,
      type: 'outcome',
      operation_description: description,
      bot_name,
    })

    logger.info({
      message: '💰 Операция с балансом выполнена',
      description: 'Balance operation completed',
      telegram_id,
      type,
      amount: paymentAmount,
      oldBalance: currentBalance,
      newBalance,
    })

    return {
      success: true,
      newBalance,
      modePrice: paymentAmount,
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
      modePrice: paymentAmount,
    }
  }
}

export async function sendBalanceMessage(
  telegram_id: string,
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
