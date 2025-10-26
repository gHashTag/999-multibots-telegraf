/**
 * @deprecated Используйте PaymentProcessor напрямую для новых реализаций
 * Эта функция сохранена для обратной совместимости
 *
 * Миграция:
 * Было:
 * ```
 * await updateUserBalance(telegram_id, amount, type, description, metadata)
 * ```
 *
 * Стало:
 * ```
 * import { PaymentProcessor } from '@/core/supabase/PaymentProcessor'
 * const result = await PaymentProcessor.createPaymentRecord({
 *   telegram_id, amount, type, description, bot_name, metadata
 * })
 * ```
 */

import { PaymentType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/enhancedLogger'
import {
  PaymentProcessor,
  type PaymentProcessorParams,
} from '@/core/supabase/PaymentProcessor'

type BalanceUpdateMetadata = {
  stars?: number
  payment_method?: string
  bot_name?: string
  language?: string
  service_type?: string
  model_name?: string
  inv_id?: string
  modePrice?: number
  currentBalance?: number
  paymentAmount?: number
  category?: 'REAL' | 'BONUS'
  [key: string]: any
}

/**
 * Создает или обновляет запись о транзакции в таблице payments
 * @deprecated Используйте PaymentProcessor.createPaymentRecord напрямую
 * @returns Promise<boolean> - успешно ли выполнено добавление/обновление записи
 */
export const updateUserBalance = async (
  telegram_id: string,
  amount: number,
  type: PaymentType,
  description?: string,
  metadata?: BalanceUpdateMetadata,
  cost_in_stars?: number
): Promise<boolean> => {
  try {
    logger.info('🔍 [updateUserBalance] Вызов функции (совместимость):', {
      description: 'Legacy updateUserBalance called',
      telegram_id,
      amount,
      type,
    })

    // Подготовка параметров для PaymentProcessor
    const params: PaymentProcessorParams = {
      telegram_id,
      amount,
      type,
      description: description || 'System operation',
      bot_name: metadata?.bot_name || 'unknown_bot',
      service_type: metadata?.service_type || null,
      model_name: metadata?.model_name || null,
      payment_method: metadata?.payment_method || 'System',
      metadata: metadata || {},
      inv_id: metadata?.inv_id,
      stars: metadata?.stars,
      cost_in_stars,
    }

    // Используем новый унифицированный обработчик
    const result = await PaymentProcessor.createPaymentRecord(params)

    if (result.success) {
      logger.info('✅ [updateUserBalance] Транзакция успешно создана:', {
        payment_id: result.payment_id,
        telegram_id,
      })
      return true
    } else {
      logger.error('❌ [updateUserBalance] Ошибка создания транзакции:', {
        telegram_id,
        error: result.error,
      })
      return false
    }
  } catch (error) {
    logger.error('❌ [updateUserBalance] Неожиданная ошибка:', {
      telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return false
  }
}
