import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

interface UpdatePaymentStatusProps {
  inv_id: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  stars?: number
  description?: string
  metadata?: Record<string, any>
}

export const updatePaymentStatus = async ({
  inv_id,
  status,
  stars,
  description,
  metadata,
}: UpdatePaymentStatusProps) => {
  try {
    const updateData: Record<string, any> = { status }

    if (stars !== undefined) updateData.stars = stars
    if (description) updateData.description = description
    if (metadata) updateData.metadata = metadata

    const { data, error } = await supabase
      .from('payments')
      .update(updateData)
      .eq('inv_id', inv_id)
      .select()
      .single()

    if (error) {
      logger.error('❌ Ошибка при обновлении статуса платежа', {
        description: 'Error updating payment status',
        error: error.message,
        inv_id,
      })
      throw error
    }

    logger.info('✅ Статус платежа обновлен', {
      description: 'Payment status updated successfully',
      inv_id,
      status,
      payment: data,
    })

    return data
  } catch (error) {
    logger.error('❌ Ошибка в updatePaymentStatus', {
      description: 'Error in updatePaymentStatus function',
      error: error.message,
      inv_id,
    })
    throw error
  }
}
