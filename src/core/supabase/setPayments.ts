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

// One payments_v2 row for one param set. Per-row derivation (id normalisation,
// cost) and per-row logging live HERE so the single-row and the atomic
// multi-row paths of setPayments cannot drift apart.
function buildPaymentRow(p: PaymentParams) {
  const amount = parseFloat(p.OutSum)
  const normalizedId = normalizeTelegramId(p.telegram_id).toString()

  if (!p.InvId) {
    logger.warn(
      '⚠️ setPayments: InvId is empty or null. Using placeholder logic if necessary or allowing NULL.'
    )
  }

  logger.info('✍️ Inserting payment record:', {
    telegram_id: normalizedId,
    amount,
    inv_id: p.InvId,
    currency: p.currency,
    status: p.status,
    payment_method: p.payment_method,
    stars: p.stars,
    bot_name: p.bot_name,
    type: p.type,
    language: p.language,
    subscription_type: p.subscription_type,
    metadata: p.metadata || {},
  })

  // Compute cost when the caller did not supply one.
  let finalCost = p.cost
  if (p.type === PaymentType.MONEY_OUTCOME && finalCost === undefined) {
    finalCost = calculateServiceCost(
      p.service_type,
      p.metadata as Record<string, any>,
      p.stars
    )
    logger.info('🧮 Автоматически рассчитан cost в setPayments:', {
      telegram_id: normalizedId,
      service_type: p.service_type,
      metadata: p.metadata,
      stars: p.stars,
      calculatedCost: finalCost,
    })
  } else if (p.type === PaymentType.MONEY_INCOME) {
    finalCost = 0 // income rows always carry cost 0
  }

  return {
    telegram_id: normalizedId,
    amount: amount,
    inv_id: p.InvId,
    currency: p.currency,
    status: p.status,
    payment_method: p.payment_method,
    description: `Payment via ${p.payment_method}`,
    stars: p.stars,
    bot_name: p.bot_name,
    type: p.type,
    language: p.language,
    subscription_type: p.subscription_type,
    service_type: p.type === PaymentType.MONEY_OUTCOME ? p.service_type : null,
    cost: finalCost,
    metadata: p.metadata || {},
  }
}

// Accepts ONE param set (unchanged behaviour) OR an ARRAY. An array is written
// as ONE multi-row INSERT, which Postgres executes all-or-nothing: a paired
// MONEY_INCOME + compensating MONEY_OUTCOME (club fee, feed-star gift) can no
// longer be left half-written by a transient failure between two separate
// inserts -- the failure mode that minted an orphaned, spendable income row.
// A 23505 (duplicate) on the batch means the rows already exist (retry).
export const setPayments = async (input: PaymentParams | PaymentParams[]) => {
  const list = Array.isArray(input) ? input : [input]
  const invIds = list.map(p => p.InvId)
  try {
    const rows = list.map(buildPaymentRow)

    const { error } = await supabase
      .from('payments_v2')
      .insert(list.length === 1 ? rows[0] : rows)

    // Уведомление владельца отправляется из robokassa.routes.ts после реальной оплаты

    if (error) {
      logger.error('❌ Error inserting payment', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        inv_ids: invIds,
      })

      // Повтор той же записи — не беда: строка уже есть, а именно она и нужна.
      if (error.code === '23505') {
        logger.warn(
          `⚠️ Attempted to insert duplicate payment record for InvId: ${invIds.join(', ')}. Ignoring.`
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
          `Не удалось создать запись платежа (inv_id ${invIds.join(', ')}): ${error.message}`
        )
      }
    } else {
      logger.info(
        `✅ Payment record inserted successfully for InvId: ${invIds.join(', ')}, User: ${rows.map(r => r.telegram_id).join(', ')}`
      )
    }
  } catch (error) {
    logger.error('❌ Error in setPayments function', {
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      input_params: { inv_ids: invIds },
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
