import { supabase } from '.'
import { logger } from '@/utils/logger'
import { TelegramId } from '@/interfaces/telegram.interface'
import { TransactionType } from '@/interfaces/payments.interface'

interface CreateSuccessfulPaymentParams {
  telegram_id: TelegramId
  amount: number
  stars: number
  payment_method: string
  description: string
  type: TransactionType
  bot_name: string
  status: 'COMPLETED' | 'PENDING' | 'FAILED'
  metadata?: Record<string, any>
  currency?: string
  subscription?: string
  language?: string
  inv_id?: string
}

/**
 * Создает запись об успешном платеже в таблице payments_v2
 */
export const createSuccessfulPayment = async (
  params: CreateSuccessfulPaymentParams
) => {
  try {
    const {
      telegram_id,
      amount,
      stars,
      payment_method,
      description,
      type,
      bot_name,
      status,
      metadata = {},
      currency = 'STARS',
      subscription = 'none',
      language = 'ru',
      inv_id,
    } = params

    logger.info('💰 Создание записи о платеже:', {
      description: 'Creating payment record',
      telegram_id,
      amount,
      stars,
      payment_method,
      payment_description: description,
      type,
      bot_name,
      status,
    })

    // Нормализуем telegram_id к строке
    const normalizedTelegramId = String(telegram_id)

    // Создаем запись в таблице payments_v2
    const { data, error } = await supabase
      .from('payments_v2')
      .insert({
        telegram_id: normalizedTelegramId,
        amount,
        stars,
        payment_method,
        description,
        type,
        bot_name,
        status,
        payment_date: new Date().toISOString(),
        metadata,
        currency,
        subscription,
        language,
        inv_id: inv_id || `${normalizedTelegramId}-${Date.now()}`,
      })
      .select('*')
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
      type,
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
 