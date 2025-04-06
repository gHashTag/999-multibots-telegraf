import { TelegramId } from '@/interfaces/telegram.interface'
import { supabase } from './index'
import { logger } from '@/utils/logger'
import { Payment } from '@/interfaces/payments.interface'

/**
 * Получает информацию о платежах пользователя
 */
export async function getPaymentsInfoByTelegramId(
  telegram_id: TelegramId
): Promise<Payment[]> {
  try {
    logger.info({
      message: '🔍 Получение информации о платежах',
      description: 'Getting payments info',
      telegram_id,
    })

    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegram_id)
      .order('payment_date', { ascending: false })

    if (error) {
      logger.error({
        message: '❌ Ошибка при получении информации о платежах',
        description: 'Error getting payments info',
        error,
        telegram_id,
      })
      throw error
    }

    logger.info({
      message: '✅ Информация о платежах получена',
      description: 'Payments info retrieved',
      count: payments?.length || 0,
      telegram_id,
    })

    return payments as Payment[]
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в getPaymentsInfoByTelegramId',
      description: 'Error in getPaymentsInfoByTelegramId function',
      error,
      telegram_id,
    })
    throw error
  }
}
