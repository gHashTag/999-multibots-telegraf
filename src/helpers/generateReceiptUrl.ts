import { logger } from '@/utils/logger'

/**
 * Параметры для генерации URL чека
 */
export interface ReceiptUrlParams {
  operationId: string
  amount?: number
  stars?: number
  botName?: string
  telegramId?: string
  timestamp?: string
}

/**
 * Генерирует URL для страницы чека оплаты
 *
 * @param params - Параметры для генерации URL
 * @returns URL страницы чека
 */
export function generateReceiptUrl(params: ReceiptUrlParams): string {
  try {
    // Базовый URL чека (настраивается через env)
    const baseUrl =
      process.env.RECEIPT_URL || 'https://receipts.neuro-blogger.app/payment'

    // Обязательный параметр - ID операции
    const operationId = params.operationId

    // Формируем URL с параметрами
    const url = new URL(baseUrl)
    url.searchParams.append('operation_id', operationId)

    // Добавляем опциональные параметры, если они есть
    if (params.amount) {
      url.searchParams.append('amount', params.amount.toString())
    }

    if (params.stars) {
      url.searchParams.append('stars', params.stars.toString())
    }

    if (params.botName) {
      url.searchParams.append('bot_name', params.botName)
    }

    if (params.telegramId) {
      url.searchParams.append('telegram_id', params.telegramId)
    }

    if (params.timestamp) {
      url.searchParams.append('timestamp', params.timestamp)
    } else {
      // Если метка времени не указана, используем текущее время
      url.searchParams.append('timestamp', new Date().toISOString())
    }

    logger.info('✅ Сгенерирован URL чека', {
      description: 'Receipt URL generated',
      operationId,
      url: url.toString(),
    })

    return url.toString()
  } catch (error: any) {
    logger.error('❌ Ошибка при генерации URL чека', {
      description: 'Error generating receipt URL',
      error: error.message,
      params,
    })

    // В случае ошибки возвращаем запасной вариант
    return `${process.env.RECEIPT_URL || 'https://receipts.neuro-blogger.app/payment'}?operation_id=${params.operationId}`
  }
}

/**
 * Проверяет валидность URL чека
 *
 * @param url - URL для проверки
 * @returns true, если URL валиден, иначе false
 */
export function validateReceiptUrl(url: string): boolean {
  try {
    // Проверяем базовый формат URL
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return false
    }

    // Проверяем, что URL содержит параметр operation_id
    const parsedUrl = new URL(url)
    return parsedUrl.searchParams.has('operation_id')
  } catch (error) {
    return false
  }
}
