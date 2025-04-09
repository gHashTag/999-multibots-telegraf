import { supabase } from '.'
import { logger } from '@/utils/logger'
import { TelegramId, normalizeTelegramId } from '@/types/telegram.interface'

export interface GetLastPaymentParams {
  telegram_id: TelegramId
  status?: string
}

export const getLastPayment = async ({
  telegram_id,
  status,
}: GetLastPaymentParams) => {
  try {
    if (!telegram_id) {
      throw new Error('telegram_id is required')
    }

    // Нормализуем telegram_id в строку
    const normalizedId = normalizeTelegramId(telegram_id)

    logger.info('🔍 Получение последнего платежа:', {
      description: 'Getting last payment',
      telegram_id: normalizedId,
      status,
    })

    let query = supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', normalizedId)
      .order('payment_date', { ascending: false })
      .limit(1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      logger.error('❌ Ошибка при получении последнего платежа:', {
        description: 'Error getting last payment',
        error: error.message,
        telegram_id: normalizedId,
      })
      throw error
    }

    if (!data || data.length === 0) {
      logger.info('ℹ️ Платежи не найдены:', {
        description: 'No payments found',
        telegram_id: normalizedId,
      })
      return null
    }

    logger.info('✅ Последний платеж успешно получен:', {
      description: 'Last payment retrieved successfully',
      telegram_id: normalizedId,
      payment: data[0],
    })

    return data[0]
  } catch (error) {
    logger.error('❌ Ошибка в getLastPayment:', {
      description: 'Error in getLastPayment function',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
    throw error
  }
}
