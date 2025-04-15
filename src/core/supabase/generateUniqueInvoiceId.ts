import { supabase } from '.'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
/**
 * Генерирует уникальный инвойс ID с проверкой существования в базе данных
 * @param userId ID пользователя
 * @param amount Сумма платежа
 * @param maxAttempts Максимальное количество попыток генерации (по умолчанию 3)
 * @returns Уникальный ID для инвойса
 */
export async function generateUniqueInvoiceId(
  userId: string | number,
  amount: number,
  maxAttempts: number = 3
): Promise<string> {
  let attemptCount = 0

  while (attemptCount < maxAttempts) {
    attemptCount++

    // Генерируем ID
    const id = generateInvoiceId()

    // Проверяем, существует ли такой ID в базе
    const { data, error } = await supabase
      .from('payments_v2')
      .select('inv_id')
      .eq('inv_id', id)
      .maybeSingle()

    if (error) {
      logger.error('❌ Ошибка при проверке существования инвойс ID', {
        description: 'Error checking if invoice ID exists',
        error,
        id,
        attemptCount,
      })

      // Если произошла ошибка при проверке, генерируем случайный ID с префиксом
      // для дополнительной уникальности
      if (attemptCount === maxAttempts) {
        const fallbackId = generateFallbackInvoiceId(userId)
        logger.warn('⚠️ Использован запасной ID для инвойса', {
          description: 'Using fallback invoice ID',
          fallbackId,
        })
        return fallbackId
      }

      // Пробуем еще раз
      continue
    }

    // Если ID не существует в базе, возвращаем его
    if (!data) {
      if (attemptCount > 1) {
        logger.info(
          '✅ Сгенерирован уникальный ID инвойса после нескольких попыток',
          {
            description: 'Generated unique invoice ID after multiple attempts',
            id,
            attemptCount,
          }
        )
      } else {
        logger.info('✅ Сгенерирован уникальный ID инвойса', {
          description: 'Generated unique invoice ID',
          id,
        })
      }

      return id
    }

    logger.warn('⚠️ Обнаружен дублирующийся ID инвойса, генерация нового', {
      description: 'Duplicate invoice ID detected, generating new one',
      duplicateId: id,
      attemptCount,
    })
  }

  // Если после всех попыток не удалось сгенерировать уникальный ID,
  // используем запасной вариант с префиксом времени в миллисекундах
  const fallbackId = generateFallbackInvoiceId(userId)

  logger.warn(
    '⚠️ Использован запасной ID для инвойса после исчерпания попыток',
    {
      description: 'Using fallback invoice ID after exhausting attempts',
      fallbackId,
      maxAttempts,
    }
  )

  return fallbackId
}

/**
 * Генерирует ID для инвойса по стандартному алгоритму
 * @param userId ID пользователя
 * @param amount Сумма платежа
 * @returns ID для инвойса
 */
function generateInvoiceId(): string {
  // Берем последние 5 цифр timestamp
  const timestamp = Date.now() % 100000
  // Случайное число от 1000 до 9999
  const random = Math.floor(Math.random() * 9000) + 1000
  // Объединяем в одно число
  return `${timestamp}${random}${uuidv4()}`
}

/**
 * Генерирует запасной ID для инвойса с повышенной уникальностью
 * @param userId ID пользователя
 * @param amount Сумма платежа
 * @returns Запасной ID для инвойса
 */
function generateFallbackInvoiceId(userId: string | number): string {
  // Используем полный timestamp + хеш от userId и суммы
  const timestamp = Date.now()
  // Берем последние 4 цифры userId для дополнительной уникальности
  const userSuffix = String(userId).slice(-4)
  // Случайное число от 1000 до 9999
  const random = Math.floor(Math.random() * 9000) + 1000

  return `${timestamp}${userSuffix}${random}`
}
