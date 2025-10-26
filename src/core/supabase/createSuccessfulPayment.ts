/**
 * @deprecated Используйте PaymentProcessor напрямую для новых реализаций
 * Эта функция сохранена для обратной совместимости
 *
 * Миграция:
 * Было:
 * ```
 * await createSuccessfulPayment({ telegram_id, amount, type, ... })
 * ```
 *
 * Стало:
 * ```
 * import { PaymentProcessor } from '@/core/supabase/PaymentProcessor'
 * const result = await PaymentProcessor.createPaymentRecord({...})
 * ```
 */

import { TelegramId } from '@/interfaces/telegram.interface'
import { PaymentStatus, Currency } from '@/interfaces/payments.interface'
import { logger } from '@/utils/enhancedLogger'
import { type PaymentV2 } from '@/interfaces/zod/payment.zod'
import {
  PaymentProcessor,
  type PaymentProcessorParams,
} from '@/core/supabase/PaymentProcessor'

interface CreateSuccessfulPaymentParams {
  telegram_id: TelegramId
  amount: number
  type: string
  description: string
  bot_name: string
  service_type?: string
  model_name?: string
  payment_method?: string
  metadata?: Record<string, any>
  inv_id: string
  stars?: number
  status?: PaymentStatus
  currency?: Currency
  invoice_url?: string
}

/**
 * Создает успешный платеж в системе
 * @deprecated Используйте PaymentProcessor.createPaymentRecord напрямую
 * @param params Параметры платежа
 * @returns Результат создания платежа
 */
export async function createSuccessfulPayment({
  telegram_id,
  amount,
  type,
  description,
  service_type,
  model_name,
  stars,
  payment_method = 'Telegram',
  bot_name,
  metadata = {},
  status = PaymentStatus.COMPLETED,
  inv_id,
  currency = Currency.XTR,
  invoice_url,
}: CreateSuccessfulPaymentParams): Promise<PaymentV2 | null> {
  try {
    logger.info('🔍 [createSuccessfulPayment] Вызов функции (совместимость):', {
      description: 'Legacy createSuccessfulPayment called',
      telegram_id,
      inv_id,
    })

    // Подготовка параметров для PaymentProcessor
    const params: PaymentProcessorParams = {
      telegram_id: String(telegram_id),
      amount,
      type,
      description,
      bot_name,
      service_type: service_type || null,
      model_name: model_name || null,
      payment_method,
      metadata: {
        ...metadata,
        invoice_url,
      },
      inv_id,
      stars,
      status,
      currency,
    }

    // Используем новый унифицированный обработчик
    const result = await PaymentProcessor.createPaymentRecord(params)

    if (result.success && result.payment) {
      logger.info('✅ [createSuccessfulPayment] Платеж успешно создан:', {
        payment_id: result.payment_id,
        telegram_id,
      })
      return result.payment
    } else {
      logger.error('❌ [createSuccessfulPayment] Ошибка создания платежа:', {
        telegram_id,
        error: result.error,
      })
      return null
    }
  } catch (error) {
    logger.error('❌ [createSuccessfulPayment] Неожиданная ошибка:', {
      telegram_id,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
