import crypto from 'crypto'
import { logger } from '@/utils/logger'

/**
 * Проверяет подпись запроса от Robokassa.
 * @param outSum Сумма
 * @param invId ID инвойса
 * @param password Пароль (обычно PASSWORD2 для вебхуков)
 * @param signature Полученная подпись
 * @returns true, если подпись валидна, иначе false
 */
export const validateRobokassaSignature = (
  outSum: string,
  invId: string,
  password: string,
  signature: string | any
): boolean => {
  try {
    // Проверяем наличие всех параметров
    if (!outSum || !invId || !password || !signature) {
      logger.warn('Robokassa signature validation: missing parameters', {
        hasOutSum: !!outSum,
        hasInvId: !!invId,
        hasPassword: !!password,
        hasSignature: !!signature,
      })
      return false
    }

    // Преобразуем signature в строку для безопасности
    const signatureStr = String(signature)

    // Формируем строку для хеширования: OutSum:InvId:Пароль
    const dataToHash = `${outSum}:${invId}:${password}`
    // Рассчитываем MD5 хеш
    const calculatedSignature = crypto
      .createHash('md5')
      .update(dataToHash)
      .digest('hex')

    // Сравниваем рассчитанную подпись с полученной (регистронезависимо)
    const isValid =
      calculatedSignature.toLowerCase() === signatureStr.toLowerCase()
    if (!isValid) {
      logger.warn('Robokassa signature validation failed', {
        calculated: calculatedSignature,
        received: signature,
        dataHashed: dataToHash.replace(password, '***PASSWORD***'), // Скрываем пароль в логах
      })
    }
    return isValid
  } catch (error: any) {
    logger.error('Error validating Robokassa signature', {
      error: error.message,
      stack: error.stack,
    })
    return false
  }
}
