import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { TelegramId, normalizeTelegramId } from '@/types/telegram.interface'

/**
 * 🔄 Обновляет статус платежа
 */
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED'

export interface UpdatePaymentStatusParams {
  telegram_id: TelegramId
  inv_id: string
  status: string
  error_message?: string
}

export const updatePaymentStatus = async ({
  telegram_id,
  inv_id,
  status,
  error_message,
}: UpdatePaymentStatusParams) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    if (!inv_id) {
      throw new Error('inv_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔄 Обновление статуса платежа:', {
      description: 'Updating payment status',
      telegram_id: normalizedId,
      inv_id,
      status,
      error_message,
    })

    const { data, error } = await supabase
      .from('payments_v2')
      .update({
        status,
        error_message,
        updated_at: new Date(),
      })
      .eq('telegram_id', normalizedId)
      .eq('inv_id', inv_id)
      .select()

    if (error) {
      logger.error('❌ Ошибка при обновлении статуса платежа:', {
        description: 'Error updating payment status',
        error: error.message,
        telegram_id: normalizedId,
        inv_id,
        status,
      })
      throw error
    }

    logger.info('✅ Статус платежа успешно обновлен:', {
      description: 'Payment status updated successfully',
      telegram_id: normalizedId,
      inv_id,
      status,
      payment_record: data && data.length > 0 ? data[0] : null,
    })

    return data && data.length > 0 ? data[0] : null
  } catch (error) {
    logger.error('❌ Ошибка в updatePaymentStatus:', {
      description: 'Error in updatePaymentStatus function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
      inv_id,
      status,
    })
    throw error
  }
}
