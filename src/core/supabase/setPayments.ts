import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import {
  PaymentStatus,
  Currency,
  PaymentType,
} from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { notifyBotOwners } from '@/core/supabase/notifyBotOwners'
import { calculateServiceCost } from '@/price/helpers/calculateServiceCost'

type PaymentParams = {
  telegram_id: string
  OutSum: string
  InvId: string | null
  currency: Currency
  stars: number
  status: PaymentStatus
  payment_method: string
  bot_name: string
  language: string
  type: PaymentType
  subscription_type: SubscriptionType | null
  metadata?: object
  service_type?: string | null
  cost?: number
}

/**
 * Функция для записи информации о платеже в базу данных
 * Принимает объект с параметрами платежа
 */

export const setPayments = async ({
  telegram_id,
  OutSum,
  InvId,
  currency,
  stars,
  status,
  payment_method,
  bot_name,
  language,
  type,
  subscription_type,
  metadata,
  service_type,
  cost,
}: PaymentParams) => {
  try {
    const amount = parseFloat(OutSum)
    const normalizedId = normalizeTelegramId(telegram_id).toString()

    if (!InvId) {
      logger.warn(
        '⚠️ setPayments: InvId is empty or null. Using placeholder logic if necessary or allowing NULL.'
      )
    }

    logger.info('✍️ Inserting payment record:', {
      telegram_id: normalizedId,
      amount,
      inv_id: InvId,
      currency,
      status,
      payment_method,
      stars,
      bot_name,
      type: type,
      language,
      subscription_type: subscription_type,
      metadata: metadata || {},
    })

    // Рассчитываем cost если не передан
    let finalCost = cost
    if (type === PaymentType.MONEY_OUTCOME && finalCost === undefined) {
      finalCost = calculateServiceCost(
        service_type,
        metadata as Record<string, any>,
        stars
      )
      logger.info('🧮 Автоматически рассчитан cost в setPayments:', {
        telegram_id: normalizedId,
        service_type,
        metadata,
        stars,
        calculatedCost: finalCost,
      })
    } else if (type === PaymentType.MONEY_INCOME) {
      finalCost = 0 // Для доходов cost всегда 0
    }

    const { error } = await supabase.from('payments_v2').insert({
      telegram_id: normalizedId,
      amount: amount,
      inv_id: InvId,
      currency: currency,
      status,
      payment_method,
      description: `Payment via ${payment_method}`,
      stars: stars,
      bot_name,
      type: type,
      language,
      subscription_type: subscription_type,
      service_type: type === PaymentType.MONEY_OUTCOME ? service_type : null,
      cost: finalCost,
      metadata: metadata || {},
    })

    if (subscription_type) {
      await notifyBotOwners(bot_name, {
        username: normalizedId,
        telegram_id: telegram_id.toString(),
        amount: parseFloat(OutSum),
        stars,
        subscription: subscription_type,
      })
    }

    if (error) {
      logger.error('❌ Error inserting payment', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        telegram_id: normalizedId,
        inv_id: InvId,
      })
      if (error.code === '23505') {
        logger.warn(
          `⚠️ Attempted to insert duplicate payment record for InvId: ${InvId}. Ignoring.`
        )
      }
    } else {
      logger.info(
        `✅ Payment record inserted successfully for InvId: ${InvId}, User: ${normalizedId}`
      )
    }
  } catch (error) {
    logger.error('❌ Error in setPayments function', {
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      input_params: { telegram_id, InvId },
    })
  }
}
