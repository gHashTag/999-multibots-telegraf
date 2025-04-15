import { logger } from '@/utils/logger'

/**
 * Генерирует короткий идентификатор инвойса
 * @returns {number} Короткий идентификатор инвойса (6 цифр)
 */
export function generateShortInvId(): number {
  // Генерируем случайное число от 100000 до 999999
  const invId = Math.floor(Math.random() * 900000) + 100000

  logger.info('🎲 Сгенерирован короткий InvId:', {
    description: 'Generated short InvId',
    invId,
  })

  return invId
}
