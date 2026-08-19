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

    // Уведомление владельца отправляется из robokassa.routes.ts после реальной оплаты

    if (error) {
      logger.error('❌ Error inserting payment', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        telegram_id: normalizedId,
        inv_id: InvId,
      })

      // Повтор той же записи — не беда: строка уже есть, а именно она и нужна.
      if (error.code === '23505') {
        logger.warn(
          `⚠️ Attempted to insert duplicate payment record for InvId: ${InvId}. Ignoring.`
        )
      } else {
        // ОСТАЛЬНЫЕ ОШИБКИ ПРОБРАСЫВАЕМ.
        //
        // Раньше ошибка только писалась в журнал, и функция возвращала
        // undefined — то есть выглядела успешной. Вызывающие при этом всё
        // делали правильно: getRuBillWizard оборачивает вызов в try/catch и
        // при ошибке говорит человеку «не удалось создать платёж, попробуйте
        // снова». Эта защита не срабатывала НИКОГДА, потому что бросать было
        // нечему.
        //
        // Цена молчания: запись PENDING не создалась, человек ушёл платить по
        // ссылке, деньги списались у платёжной системы, а обратный вызов
        // Robokassa не нашёл платёж по inv_id и ответил «Payment not found»
        // (robokassa.routes.ts). Звёзды не начислены, следа в базе нет.
        throw new Error(
          `Не удалось создать запись платежа (inv_id ${InvId}): ${error.message}`
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
    // Пробрасываем дальше: вызывающие умеют показать человеку, что платёж не
    // создан, и не отправить его платить в никуда. Молчание здесь стоило бы
    // ему денег.
    throw error
  }
}

/**
 * Функция для обновления subscription_type пользователя в последней записи
 * Используется для исправления данных пользователей
 */
export const updateUserSubscriptionType = async (
  telegram_id: string,
  newSubscriptionType: SubscriptionType
) => {
  try {
    const normalizedId = normalizeTelegramId(telegram_id).toString()

    logger.info('🔧 Обновление subscription_type пользователя:', {
      telegram_id: normalizedId,
      newSubscriptionType,
    })

    // Находим последнюю запись пользователя с оплатой
    const { data: latestPayment, error: findError } = await supabase
      .from('payments_v2')
      .select('id, subscription_type, payment_date')
      .eq('telegram_id', normalizedId)
      .eq('status', PaymentStatus.COMPLETED)
      .eq('type', PaymentType.MONEY_INCOME)
      .order('payment_date', { ascending: false })
      .limit(1)
      .single()

    if (findError || !latestPayment) {
      logger.error('❌ Не найдена запись для обновления:', {
        telegram_id: normalizedId,
        error: findError,
      })
      return false
    }

    logger.info('📋 Найдена запись для обновления:', {
      telegram_id: normalizedId,
      paymentId: latestPayment.id,
      currentSubscriptionType: latestPayment.subscription_type,
      paymentDate: latestPayment.payment_date,
    })

    // Обновляем subscription_type
    const { error: updateError } = await supabase
      .from('payments_v2')
      .update({ subscription_type: newSubscriptionType })
      .eq('id', latestPayment.id)

    if (updateError) {
      logger.error('❌ Ошибка обновления subscription_type:', {
        telegram_id: normalizedId,
        error: updateError,
      })
      return false
    }

    logger.info('✅ subscription_type успешно обновлен:', {
      telegram_id: normalizedId,
      paymentId: latestPayment.id,
      oldSubscriptionType: latestPayment.subscription_type,
      newSubscriptionType,
    })

    return true
  } catch (error) {
    logger.error('❌ Критическая ошибка в updateUserSubscriptionType:', {
      telegram_id,
      newSubscriptionType,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
