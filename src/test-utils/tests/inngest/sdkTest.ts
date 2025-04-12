import { Inngest, NonRetriableError } from 'inngest'
import { logger } from '../../../utils/logger'
import { TestResult } from '../../types'

/**
 * Тест для проверки SDK Inngest
 * Отправляет тестовое событие через SDK Inngest и проверяет результат
 */
export async function runInngestSDKTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста SDK Inngest')

    // Проверяем наличие ключа события
    const eventKey = process.env.INNGEST_EVENT_KEY
    if (!eventKey) {
      throw new Error('Переменная окружения INNGEST_EVENT_KEY не задана')
    }

    logger.info('✅ Ключ события Inngest найден')
    logger.info('📊 Параметры Inngest:')
    logger.info(`- INNGEST_EVENT_KEY: ${eventKey ? 'задан' : 'не задан'}`)
    logger.info(
      `- INNGEST_SIGNING_KEY: ${process.env.INNGEST_SIGNING_KEY ? 'задан' : 'не задан'}`
    )
    logger.info(
      `- INNGEST_URL: ${process.env.INNGEST_URL || 'не задан (будет использован по умолчанию)'}`
    )

    // Инициализируем клиент Inngest
    const inngest = new Inngest({
      id: 'neuro-blogger-test-sdk',
      logger: console,
    })

    logger.info('✅ Клиент Inngest инициализирован')

    // Отправляем тестовое событие
    await sendTestEvent(inngest)

    logger.info('✅ Тест SDK Inngest успешно пройден')
    return {
      success: true,
      message: 'Тест SDK Inngest успешно пройден',
      name: 'Inngest SDK Test',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при выполнении теста SDK Inngest')
    logger.error(`📄 Ошибка: ${error.message}`)

    return {
      success: false,
      message: `Ошибка при тестировании SDK Inngest: ${error.message}`,
      name: 'Inngest SDK Test',
    }
  }
}

/**
 * Функция для отправки тестового события через SDK Inngest
 */
async function sendTestEvent(inngestClient: Inngest): Promise<void> {
  try {
    logger.info('🚀 Подготовка тестового события для отправки через SDK')

    // Создаем тестовое событие
    const testEvent = {
      name: 'test/sdk-test-event',
      data: {
        message: 'Тестовое событие от SDK',
        timestamp: new Date().toISOString(),
        testId: `sdk-test-${Date.now()}`,
      },
    }

    logger.info(`📝 Подготовлено событие: ${testEvent.name}`)
    logger.debug('📊 Детали события:', testEvent.data)

    // Отправляем событие
    logger.info('🚀 Отправка события через SDK...')
    await inngestClient.send(testEvent)

    logger.info('✅ Событие успешно отправлено через SDK')
  } catch (error: any) {
    // Обрабатываем ошибки Inngest
    if (error instanceof NonRetriableError) {
      logger.error(
        '❌ Критическая ошибка Inngest (NonRetriableError):',
        error.message
      )
    } else {
      logger.error('❌ Ошибка при отправке события через SDK:', error.message)
    }

    throw error
  }
}
