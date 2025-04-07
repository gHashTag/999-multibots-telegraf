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

/**
 * Получает платеж по ID платежа из внешней системы (inv_id)
 */
export const getPaymentByInvId = async (invId: string) => {
  try {
    logger.info('🔍 Поиск платежа по inv_id:', {
      description: 'Finding payment by inv_id',
      inv_id: invId,
    })

    const { data, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('inv_id', invId)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 - это код ошибки "не найдено", его не логируем как ошибку
      logger.error('❌ Ошибка при поиске платежа:', {
        description: 'Error finding payment',
        error: error.message,
        error_details: error,
        inv_id: invId,
      })
      return null
    }

    if (!data) {
      logger.info('ℹ️ Платеж не найден:', {
        description: 'Payment not found',
        inv_id: invId,
      })
      return null
    }

    logger.info('✅ Платеж найден:', {
      description: 'Payment found',
      payment_id: data.payment_id,
      inv_id: invId,
      amount: data.amount,
      status: data.status,
    })

    return data
  } catch (error) {
    logger.error('❌ Ошибка в getPaymentByInvId:', {
      description: 'Error in getPaymentByInvId function',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
      inv_id: invId,
    })
    return null
  }
}
