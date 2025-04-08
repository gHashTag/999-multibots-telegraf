import { supabase } from '@/core/supabase'
import { Logger as logger } from '@/utils/logger'

export const getPaymentStatus = async (inv_id: string) => {
  try {
    logger.info({
      message: '🔍 Проверка статуса платежа',
      description: 'Checking payment status',
      inv_id,
    })

    const { data, error } = await supabase
      .from('payments_v2')
      .select('status, amount')
      .eq('inv_id', inv_id)
      .limit(1)

    if (error) {
      logger.error({
        message: '❌ Ошибка при проверке статуса платежа',
        description: 'Error checking payment status',
        error: error.message,
        inv_id,
      })
      return null
    }

    if (!data || data.length === 0) {
      logger.info({
        message: '❓ Платеж не найден',
        description: 'Payment not found',
        inv_id,
      })
      return null
    }

    logger.info({
      message: '✅ Статус платежа получен',
      description: 'Payment status retrieved',
      inv_id,
      status: data[0].status,
      amount: data[0].amount,
    })

    return data[0]
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при проверке статуса платежа',
      description: 'Error checking payment status',
      error: error instanceof Error ? error.message : String(error),
      inv_id,
    })
    return null
  }
}
