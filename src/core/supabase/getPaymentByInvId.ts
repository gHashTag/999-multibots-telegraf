import { supabase } from '.'
import { logger } from '@/utils/logger'
import { Payment, TransactionType } from '@/interfaces/payments.interface'

/**
 * Получает платеж по inv_id
 */
export async function getPaymentByInvId(inv_id: string): Promise<Payment | null> {
  try {
    logger.info({
      message: '🔍 Поиск платежа по inv_id',
      description: 'Looking up payment by inv_id',
      inv_id,
    })

    const { data: payment, error } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('inv_id', inv_id)
      .single()

    if (error) {
      logger.error({
        message: '❌ Ошибка при поиске платежа',
        description: 'Error looking up payment',
        error,
        inv_id,
      })
      return null
    }

    if (!payment) {
      logger.info({
        message: '❌ Платеж не найден',
        description: 'Payment not found',
        inv_id,
      })
      return null
    }

    logger.info({
      message: '✅ Платеж найден',
      description: 'Payment found',
      payment,
    })

    return payment as Payment
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при поиске платежа',
      description: 'Error looking up payment',
      error,
      inv_id,
    })
    return null
  }
}
