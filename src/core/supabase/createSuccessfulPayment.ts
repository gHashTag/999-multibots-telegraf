import { TelegramId } from '@/interfaces/telegram.interface'
import { TransactionType } from '@/interfaces/payments.interface'
import { supabase } from '@/supabase'
import { getUserByTelegramId } from './getUserByTelegramId'
import { normalizeTransactionType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'

interface CreateSuccessfulPaymentParams {
  telegram_id: TelegramId
  amount: number
  type: TransactionType | string
  description: string
  service_type?: string
  stars?: number
  payment_method?: string
  bot_name: string
  metadata?: Record<string, any>
  status?: string
  inv_id?: string
  currency?: string
  invoice_url?: string
}

/**
 * Создает успешный платеж в системе
 * @param params Параметры платежа
 * @returns Результат создания платежа
 */
export async function createSuccessfulPayment({
  telegram_id,
  amount,
  type,
  description,
  service_type,
  stars,
  payment_method = 'Telegram',
  bot_name,
  metadata,
  status = 'COMPLETED',
  inv_id,
  currency = 'XTR',
  invoice_url,
}: CreateSuccessfulPaymentParams) {
  try {
    // Получаем пользователя для проверки
    const user = await getUserByTelegramId(telegram_id)
    if (!user) {
      throw new Error(`User not found for telegram_id: ${telegram_id}`)
    }

    // Создаем копию параметров для модификации
    const params = {
      telegram_id,
      amount,
      type,
      description,
      service_type,
      stars,
      payment_method,
      bot_name,
      metadata,
      status,
      inv_id,
      currency,
      invoice_url,
    }

    // Нормализуем тип транзакции в нижний регистр для совместимости с БД
    params.type = normalizeTransactionType(type as TransactionType)

    // Нормализуем telegram_id к строке
    const telegramIdStr = String(telegram_id)

    const numericStars = stars !== undefined ? Number(stars) : amount

    const { data, error } = await supabase
      .from('payments_v2')
      .insert({
        telegram_id: telegramIdStr,
        amount,
        stars: numericStars,
        payment_method,
        description,
        type: params.type,
        service_type,
        bot_name,
        status,
        metadata,
        currency,
        inv_id,
        invoice_url,
      })
      .select()
      .single()

    if (error) {
      logger.error('❌ Ошибка при создании записи о платеже:', {
        description: 'Error creating payment record',
        error: error.message,
        error_details: error,
        telegram_id,
        amount,
        type,
        bot_name,
      })
      throw error
    }

    logger.info('✅ Запись о платеже успешно создана:', {
      description: 'Payment record created successfully',
      payment_id: data.payment_id,
      telegram_id,
      amount,
      type: params.type,
      bot_name,
    })

    return data
  } catch (error) {
    logger.error('❌ Ошибка в createSuccessfulPayment:', {
      description: 'Error in createSuccessfulPayment function',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
    })
    throw error
  }
}
