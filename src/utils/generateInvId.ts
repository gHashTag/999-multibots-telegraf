import { v4 as uuidv4 } from 'uuid'
import { logger } from './logger'

/**
 * Генерирует уникальный inv_id для платежей
 * @param telegram_id - ID пользователя в Telegram
 * @param amount - Сумма платежа
 * @returns Уникальный inv_id в формате: timestamp-telegram_id-amount-uuid
 */
export const generateInvId = (telegram_id: string | number, amount: number): string => {
  try {
    const invId =  uuidv4()

    logger.info('🔑 Сгенерирован inv_id:', {
      description: 'Generated inv_id',
      inv_id: invId,
      telegram_id,
      amount,
    })

    return invId
  } catch (error) {
    logger.error('❌ Ошибка при генерации inv_id:', {
      description: 'Error generating inv_id',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
      amount,
    })
    throw error
  }
} 