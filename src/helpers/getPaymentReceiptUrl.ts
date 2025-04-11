import { logger } from '@/utils/logger'
import { supabaseClient } from '@/core/supabase'
import { generateReceiptUrl } from './generateReceiptUrl'

/**
 * Получает URL чека по ID платежа
 *
 * @param paymentId - ID платежа в системе
 * @returns URL чека платежа
 */
export async function getPaymentReceiptUrl(
  paymentId: string | number
): Promise<string> {
  try {
    logger.info('🔍 Получение данных платежа для генерации чека', {
      description: 'Getting payment data for receipt generation',
      paymentId,
    })

    // Получаем данные платежа из базы данных
    const { data: payment, error } = await supabaseClient
      .from('payments_v2')
      .select('*')
      .eq('id', paymentId)
      .single()

    if (error || !payment) {
      logger.error('❌ Ошибка при получении данных платежа', {
        description: 'Error getting payment data',
        paymentId,
        error: error?.message,
      })
      throw new Error(
        `Не удалось получить данные платежа: ${error?.message || 'платеж не найден'}`
      )
    }

    logger.info('✅ Данные платежа получены', {
      description: 'Payment data retrieved successfully',
      paymentId,
    })

    // Генерируем URL чека с использованием полученных данных
    const receiptUrl = generateReceiptUrl({
      operationId: payment.id.toString(),
      amount: payment.amount,
      stars: payment.stars,
      botName: payment.bot_name,
      telegramId: payment.telegram_id?.toString(),
      timestamp: payment.created_at,
    })

    logger.info('🧾 URL чека сгенерирован', {
      description: 'Receipt URL generated',
      paymentId,
      url: receiptUrl,
    })

    return receiptUrl
  } catch (error: any) {
    logger.error('❌ Ошибка при генерации URL чека', {
      description: 'Error generating receipt URL',
      paymentId,
      error: error.message,
    })
    throw error
  }
}
