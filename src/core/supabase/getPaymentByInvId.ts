import { supabase } from '.'
import { logger } from '@/utils/logger'

export interface Payment {
  payment_id: number
  telegram_id: string
  amount: number
  stars: number
  status: string
  payment_method: string
  description: string
  metadata: any
  currency: string
  subscription: string
  bot_name: string
  language: string
  inv_id: string
  email?: string
  payment_date?: Date
}

export const getPaymentByInvId = async (
  inv_id: string
): Promise<Payment | null> => {
  try {
    if (!inv_id) {
      throw new Error('inv_id is required')
    }

    logger.info('🔍 Получение платежа по inv_id:', {
      description: 'Getting payment by inv_id',
      inv_id,
    })

    const { data, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('inv_id', inv_id)
      .order('payment_date', { ascending: false })
      .limit(1)

    if (error) {
      logger.error('❌ Ошибка при получении платежа:', {
        description: 'Error getting payment',
        error: error.message,
        inv_id,
      })
      throw error
    }

    if (!data || data.length === 0) {
      logger.info('ℹ️ Платеж не найден:', {
        description: 'Payment not found',
        inv_id,
      })
      return null
    }

    logger.info('✅ Платеж успешно получен:', {
      description: 'Payment retrieved successfully',
      inv_id,
      payment: data[0],
    })

    return data[0]
  } catch (error) {
    logger.error('❌ Ошибка в getPaymentByInvId:', {
      description: 'Error in getPaymentByInvId function',
      error: error instanceof Error ? error.message : String(error),
      inv_id,
    })
    throw error
  }
}
