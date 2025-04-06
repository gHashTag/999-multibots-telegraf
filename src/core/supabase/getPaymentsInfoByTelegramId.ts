import { TelegramId } from '@/interfaces/telegram.interface'
import { supabase } from './index'
import { logger } from '@/utils/logger'

interface Payment {
  payment_id: number
  money_amount: number
  stars: number
  payment_date: string
  payment_method: string
  description: string
}

export const getPaymentsInfoByTelegramId = async (
  telegram_id: TelegramId
): Promise<Payment[]> => {
  try {
    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select(
        'payment_id, amount, stars, payment_date, payment_method, description'
      )
      .eq('telegram_id', telegram_id)
      .order('payment_date', { ascending: false })

    if (error) {
      logger.error('❌ Ошибка при получении информации о платежах:', {
        description: 'Error getting payments info',
        error: error.message,
        telegram_id,
      })
      throw error
    }

    if (!payments) {
      logger.info('ℹ️ Платежи не найдены:', {
        description: 'No payments found',
        telegram_id,
      })
      return []
    }

    return payments.map(payment => ({
      payment_id: payment.payment_id,
      money_amount: payment.amount || 0,
      stars: payment.stars || 0,
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      description: payment.description,
    }))
  } catch (error) {
    logger.error('❌ Ошибка в getPaymentsInfoByTelegramId:', {
      description: 'Error in getPaymentsInfoByTelegramId',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
