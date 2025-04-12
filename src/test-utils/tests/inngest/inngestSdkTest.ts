// Импортируем библиотеку Inngest, используя require
const { Inngest, NonRetriableError } = require('inngest')
import { logger } from '../../../utils/logger'
import { TestResult } from '../../types'
import { TestCategory } from '../../core/categories'

/**
 * Проверяет подключение SDK к Inngest и отправку тестового события
 *
 * @returns Promise<TestResult> - Результат теста
 */
export async function testInngestSdk(): Promise<TestResult> {
  try {
    // ... existing code ...
    logger.info('🚀 [INNGEST_SDK_TEST]: Начало теста SDK Inngest', {
      description: 'Starting Inngest SDK test',
    })

    // Проверяем наличие необходимых переменных окружения
    const inngestEventKey = process.env.INNGEST_EVENT_KEY
    const inngestSigningKey = process.env.INNGEST_SIGNING_KEY
    const inngestUrl = process.env.INNGEST_URL || 'https://api.inngest.com'

    logger.info('ℹ️ [INNGEST_SDK_TEST]: Проверка переменных окружения', {
      description: 'Checking environment variables',
      inngestEventKey: inngestEventKey ? 'Установлен' : 'Не установлен',
      inngestSigningKey: inngestSigningKey ? 'Установлен' : 'Не установлен',
      inngestUrl,
    })

    if (!inngestEventKey) {
      throw new Error('INNGEST_EVENT_KEY не установлен')
    }

    if (!inngestSigningKey) {
      logger.warn(
        '⚠️ [INNGEST_SDK_TEST]: INNGEST_SIGNING_KEY не установлен, но это не критично'
      )
    }

    // Инициализируем Inngest клиент
    logger.info('🔄 [INNGEST_SDK_TEST]: Инициализация Inngest клиента', {
      description: 'Initializing Inngest client',
    })

    const inngest = new Inngest({
      id: 'neuro-blogger-sdk-test',
      eventKey: inngestEventKey,
      signingKey: inngestSigningKey,
      baseUrl: inngestUrl,
    })

    logger.info(
      '✅ [INNGEST_SDK_TEST]: Inngest клиент инициализирован успешно',
      {
        description: 'Inngest client initialized successfully',
      }
    )

    // Отправляем тестовое событие
    const eventResult = await sendTestEvent(inngest)

    logger.info('🏁 [INNGEST_SDK_TEST]: Тест SDK Inngest успешно завершен', {
      description: 'Inngest SDK test completed successfully',
      result: eventResult,
    })

    return {
      success: true,
      message: 'Тест SDK Inngest успешно пройден',
      name: 'Inngest SDK Test',
      category: TestCategory.Inngest,
    }
  } catch (error) {
    logger.error('❌ [INNGEST_SDK_TEST]: Ошибка выполнения теста SDK Inngest', {
      description: 'Error during Inngest SDK test',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      message: `Ошибка теста SDK Inngest: ${error instanceof Error ? error.message : String(error)}`,
      name: 'Inngest SDK Test',
      category: TestCategory.Inngest,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Отправляет тестовое событие в Inngest
 *
 * @param inngest - Инициализированный клиент Inngest
 * @returns Promise<any> - Результат отправки события
 */
async function sendTestEvent(inngest: any): Promise<any> {
  try {
    logger.info('🚀 [INNGEST_SDK_TEST]: Отправка тестового события', {
      description: 'Sending test event',
      eventName: 'test/sdk-connectivity',
    })

    const result = await inngest.send({
      name: 'test/sdk-connectivity',
      data: {
        timestamp: Date.now(),
        message: 'Тестовое событие для проверки подключения SDK',
        environment: process.env.NODE_ENV || 'development',
      },
    })

    logger.info('✅ [INNGEST_SDK_TEST]: Тестовое событие успешно отправлено', {
      description: 'Test event sent successfully',
      result,
    })

    return result
  } catch (error: unknown) {
    // Обрабатываем специфические ошибки Inngest
    if (error instanceof NonRetriableError) {
      logger.error(
        '❌ [INNGEST_SDK_TEST]: Неисправимая ошибка при отправке события',
        {
          description: 'Non-retriable error occurred while sending event',
          error: error.message,
        }
      )
    } else {
      logger.error(
        '❌ [INNGEST_SDK_TEST]: Ошибка при отправке тестового события',
        {
          description: 'Error occurred while sending test event',
          error: error instanceof Error ? error.message : String(error),
        }
      )
    }

    throw error
  }
}
