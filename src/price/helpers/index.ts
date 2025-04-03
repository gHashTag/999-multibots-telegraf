import { Telegraf } from 'telegraf'
import { MyContext, BalanceOperationResult } from '../../interfaces'
import { supabase } from '../../core/supabase'
import { inngest } from '../../core/inngest/clients'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../../utils/logger'
import { Telegram } from 'telegraf'

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

export async function processBalanceViaInngest({
  telegram_id,
  paymentAmount,
  is_ru,
  bot,
  bot_name,
  type,
  description,
  metadata = {},
}: {
  telegram_id: string
  paymentAmount: number
  is_ru: boolean
  bot: Telegraf<MyContext>
  bot_name: string
  description: string
  type: string
  metadata?: Record<string, any>
}): Promise<BalanceOperationResult> {
  try {
    const operationId = `balance-${telegram_id}-${Date.now()}-${uuidv4()}`

    logger.info('🚀 Отправка платежной операции в обработку', {
      description: 'Sending payment operation for processing',
      telegram_id,
      paymentAmount,
      type,
      operationId,
    })

    await inngest.send({
      id: operationId,
      name: 'payment/process',
      data: {
        telegram_id,
        paymentAmount,
        type,
        description,
        bot_name,
        is_ru,
        metadata: {
          ...metadata,
          operation_id: operationId,
        },
      },
    })

    // Даем время на обработку платежа
    await new Promise(resolve => setTimeout(resolve, 500))

    // Получаем результат из кеша обработанных платежей
    const result = await supabase
      .from('payments')
      .select('amount, status, stars')
      .eq('inv_id', operationId)
      .single()

    if (!result.data) {
      throw new Error('Payment processing failed')
    }

    return {
      success: true,
      newBalance: result.data.stars,
      modePrice: paymentAmount,
    }
  } catch (error) {
    logger.error('❌ Ошибка при обработке платежа', {
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

    await bot.sendMessage(telegram_id, message)
  }
}
