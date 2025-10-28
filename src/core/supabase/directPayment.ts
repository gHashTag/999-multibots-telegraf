/**
 * @deprecated Большая часть функций в этом файле устарела
 * Используйте PaymentProcessor напрямую для новых реализаций
 *
 * Миграция на PaymentProcessor описана в каждой функции
 */

import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/enhancedLogger'
import {
  PaymentStatus,
  PaymentType,
  Currency,
  PaymentCreateParams,
  PaymentProcessResult,
} from '@/interfaces/payments.interface'
import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'
import { supabaseAdmin } from '@/core/supabase/'
import { getUserById } from '@/core/supabase/'
import {
  PaymentProcessor,
  type PaymentProcessorParams,
} from '@/core/supabase/PaymentProcessor'
import { getUserBalance } from '@/core/supabase/getUserBalance'

// --- ИНТЕРФЕЙСЫ (сохранены для совместимости) ---
export interface DirectPaymentParams {
  telegram_id: string
  amount: number
  type: string
  description: string
  bot_name: string
  service_type: ModeEnum | string
  inv_id?: string
  bypass_payment_check?: boolean
  metadata?: Record<string, any>
  subscription_type?: string
}

export interface DirectPaymentResult {
  success: boolean
  payment_id?: number
  operation_id: string
  balanceChange?: {
    before: number
    after: number
    difference: number
  }
  error?: string
}

/**
 * @function directPaymentProcessor (v2.0)
 * @deprecated Используйте PaymentProcessor.createPaymentRecord напрямую
 *
 * Миграция:
 * Было:
 * ```
 * const result = await directPaymentProcessor({
 *   telegram_id, amount, type, description, bot_name, service_type
 * })
 * ```
 *
 * Стало:
 * ```
 * import { PaymentProcessor } from '@/core/supabase/PaymentProcessor'
 * const result = await PaymentProcessor.createPaymentRecord({
 *   telegram_id, amount, type, description, bot_name, service_type
 * })
 * ```
 */
export async function directPaymentProcessor(
  params: DirectPaymentParams
): Promise<DirectPaymentResult> {
  const {
    telegram_id,
    amount,
    type,
    description,
    bot_name,
    service_type,
    inv_id,
    bypass_payment_check = false,
    metadata = {},
    subscription_type,
  } = params

  const operationId = inv_id || `direct-${uuidv4()}`

  logger.info('🚀 [DIRECT_PAYMENT v2.0] Вызов функции (совместимость)', {
    telegram_id,
    amount,
    type,
    operation_id: operationId,
  })

  try {
    // Получаем баланс до операции
    const currentBalance = await getUserBalance(telegram_id)

    // Подготовка параметров для PaymentProcessor
    const processorParams: PaymentProcessorParams = {
      telegram_id,
      amount,
      type,
      description,
      bot_name,
      service_type: String(service_type),
      inv_id: operationId,
      bypass_balance_check: bypass_payment_check,
      metadata: {
        ...metadata,
        direct_payment: true,
        balance_before: currentBalance,
      },
      subscription_type: subscription_type || null,
      currency: Currency.XTR,
    }

    // Используем новый унифицированный обработчик
    const result = await PaymentProcessor.createPaymentRecord(processorParams)

    if (result.success) {
      logger.info('✅ [DIRECT_PAYMENT v2.0] Платеж успешно обработан', {
        payment_id: result.payment_id,
        telegram_id,
      })

      // Отправка уведомления пользователю (опционально)
      try {
        const notificationParams = {
          telegram_id: Number(telegram_id),
          operationId: operationId,
          amount: amount,
          currentBalance: currentBalance,
          newBalance: result.balanceChange?.after || currentBalance,
          description: description,
          isRu: metadata?.is_ru ?? true,
          bot_name: bot_name,
        }
        await sendTransactionNotificationTest(notificationParams)
        logger.info('✉️ [DIRECT_PAYMENT v2.0] Уведомление отправлено', {
          telegram_id,
        })
      } catch (notifyError) {
        logger.error('❌ [DIRECT_PAYMENT v2.0] Ошибка уведомления', {
          telegram_id,
          error:
            notifyError instanceof Error ? notifyError.message : 'Unknown',
        })
      }

      return {
        success: true,
        payment_id: result.payment_id,
        operation_id: operationId,
        balanceChange: result.balanceChange,
      }
    } else {
      logger.error('❌ [DIRECT_PAYMENT v2.0] Ошибка обработки платежа', {
        telegram_id,
        error: result.error,
      })
      return {
        success: false,
        error: result.error || 'Payment processing failed',
        operation_id: operationId,
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown direct payment error'
    logger.error('❌ [DIRECT_PAYMENT v2.0] Критическая ошибка', {
      telegram_id,
      error: errorMessage,
    })
    return { success: false, error: errorMessage, operation_id: operationId }
  }
}

/**
 * @deprecated Используйте updateUserBalance или PaymentProcessor
 * Прямое внесение платежей
 */
export async function directPayment(
  params: PaymentCreateParams
): Promise<PaymentProcessResult> {
  const {
    telegram_id,
    amount,
    stars,
    type,
    description,
    metadata,
    bot_name,
    service_type,
    subscription,
  } = params

  // 1. Проверка существования пользователя
  const user = await getUserById(telegram_id)
  if (!user) {
    return { success: false, message: 'User not found' }
  }

  // 2. Формирование данных для вставки
  const paymentData: Omit<PaymentCreateParams, 'telegram_id'> & {
    user_id: string
    status: PaymentStatus
  } = {
    user_id: user.id,
    amount,
    stars: stars ?? 0,
    type: type as PaymentType,
    description,
    metadata,
    bot_name,
    service_type: service_type ?? null,
    payment_method: params.payment_method || 'System',
    status: PaymentStatus.COMPLETED,
    subscription: subscription ?? null,
    currency: Currency.RUB,
    inv_id: params.inv_id,
  }

  // 3. Вставка платежа в базу данных
  try {
    const { data, error } = await supabaseAdmin
      .from('payments_v2')
      .insert([paymentData])
      .select()

    if (error) {
      logger.error('Error inserting direct payment:', error)
      return {
        success: false,
        message: 'Error inserting payment',
        error: error.message,
      }
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        message: 'Failed to insert payment, no data returned',
      }
    }

    return { success: true, message: 'Payment successful', payment: data[0] }
  } catch (error) {
    logger.error('Unexpected error during direct payment:', error)
    return {
      success: false,
      message: 'Unexpected system error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * @deprecated ДУБЛИКАТ! Используйте updateUserBalance из '@/core/supabase/updateUserBalance'
 *
 * ЭТА ФУНКЦИЯ ЯВЛЯЕТСЯ ДУБЛИКАТОМ И НЕ ДОЛЖНА ИСПОЛЬЗОВАТЬСЯ!
 * Используйте вместо нее:
 * ```
 * import { updateUserBalance } from '@/core/supabase/updateUserBalance'
 * ```
 *
 * Или напрямую:
 * ```
 * import { PaymentProcessor } from '@/core/supabase/PaymentProcessor'
 * await PaymentProcessor.createPaymentRecord({...})
 * ```
 */
export async function updateUserBalance(
  telegram_id: string,
  amount: number,
  type: PaymentType,
  description: string,
  metadata: Record<string, any> = {},
  bypass_payment_check = false
): Promise<boolean> {
  logger.warn(
    '⚠️ ДУБЛИКАТ ФУНКЦИИ! Используйте updateUserBalance из updateUserBalance.ts',
    {
      telegram_id,
      caller: 'directPayment.ts/updateUserBalance',
    }
  )

  // Перенаправляем на правильную функцию
  const { updateUserBalance: correctFunction } = await import(
    '@/core/supabase/updateUserBalance'
  )
  return correctFunction(telegram_id, amount, type, description, metadata)
}
