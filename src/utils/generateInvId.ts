import { logger } from './logger'

/**
 * Генерирует уникальный inv_id для платежей
 * @param telegram_id - ID пользователя в Telegram
 * @param amount - Сумма платежа
 * @returns Уникальный inv_id в формате: timestamp + random
 */
export const generateInvId = (
  telegram_id: string | number,
  amount: number
): string => {
  try {
    // Генерируем числовой ID платежа из timestamp и случайного числа
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000)
    const invId = `${timestamp}${random}`

    logger.info({
      message: '🔑 Сгенерирован inv_id',
      description: 'Generated inv_id',
      inv_id: invId,
      telegram_id,
      amount,
    })

    return invId
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при генерации inv_id',
      description: 'Error generating inv_id',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
      amount,
    })
    throw error
  }
}
