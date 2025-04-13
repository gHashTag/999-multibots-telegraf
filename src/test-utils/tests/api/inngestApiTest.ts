import { TestResult } from '../../types'
import axios from 'axios'
import { logger } from '@/utils/logger'
import { TestCategory } from '../../core/categories'
import { TEST_CONFIG } from '../../test-config'
import { inngest } from '@/inngest-functions/clients'

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000'
const INNGEST_BASE_URL = process.env.INNGEST_BASE_URL || 'http://localhost:8288'

/**
 * Проверяет доступность и функциональность Inngest API
 */
export async function testInngestAPI(): Promise<TestResult> {
  try {
    logger.info('🚀 Проверка Inngest API', {
      description: 'Testing Inngest API availability and functionality',
      inngest_api_url: `${API_BASE_URL}/api/inngest`,
      inngest_server_url: INNGEST_BASE_URL,
    })

    // Шаг 1: Проверка доступности эндпоинта /api/inngest
    logger.info('🔍 Проверка доступности эндпоинта /api/inngest', {
      description: 'Checking /api/inngest endpoint availability',
      url: `${API_BASE_URL}/api/inngest`,
    })

    const apiResponse = await axios({
      method: 'get',
      url: `${API_BASE_URL}/api/inngest`,
      timeout: TEST_CONFIG.TIMEOUTS.MEDIUM,
      validateStatus: () => true, // Принимаем любой статус
    })

    if (apiResponse.status !== 200) {
      logger.error('❌ Эндпоинт /api/inngest недоступен', {
        description: 'Inngest API endpoint is not available',
        status: apiResponse.status,
        data: apiResponse.data,
      })

      return {
        success: false,
        name: 'Проверка Inngest API',
        message: `Эндпоинт /api/inngest недоступен (статус ${apiResponse.status})`,
        category: TestCategory.Api,
        error: `Inngest API returned status ${apiResponse.status}`,
      }
    }

    logger.info('✅ Эндпоинт /api/inngest доступен', {
      description: 'Inngest API endpoint is available',
      status: apiResponse.status,
    })

    // Шаг 2: Отправка тестового события в Inngest
    logger.info('🔄 Отправка тестового события в Inngest', {
      description: 'Sending test event to Inngest',
      event_name: 'test/api-connectivity',
    })

    try {
      await inngest.send({
        name: 'test/api-connectivity',
        data: {
          timestamp: new Date().toISOString(),
          test_id: `test-${Date.now()}`,
          source: 'api-test',
        },
      })

      logger.info('✅ Тестовое событие успешно отправлено', {
        description: 'Test event successfully sent to Inngest',
      })
    } catch (error) {
      logger.error('❌ Ошибка при отправке тестового события', {
        description: 'Error sending test event to Inngest',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      return {
        success: false,
        name: 'Проверка Inngest API',
        message: 'Ошибка при отправке тестового события в Inngest',
        category: TestCategory.Api,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Шаг 3: Проверка доступности сервера Inngest
    logger.info('🔍 Проверка доступности сервера Inngest', {
      description: 'Checking Inngest server availability',
      url: INNGEST_BASE_URL,
    })

    try {
      const serverResponse = await axios({
        method: 'get',
        url: INNGEST_BASE_URL,
        timeout: TEST_CONFIG.TIMEOUTS.MEDIUM,
        validateStatus: () => true, // Принимаем любой статус
      })

      // Сервер Inngest может вернуть 404 или 200, оба статуса считаются успешными
      if (serverResponse.status !== 200 && serverResponse.status !== 404) {
        logger.error('❌ Сервер Inngest недоступен', {
          description: 'Inngest server is not available',
          status: serverResponse.status,
          data: serverResponse.data,
        })

        return {
          success: false,
          name: 'Проверка Inngest API',
          message: `Сервер Inngest недоступен (статус ${serverResponse.status})`,
          category: TestCategory.Api,
          error: `Inngest server returned status ${serverResponse.status}`,
        }
      }

      logger.info('✅ Сервер Inngest доступен', {
        description: 'Inngest server is available',
        status: serverResponse.status,
      })
    } catch (error) {
      logger.warn('⚠️ Не удалось проверить доступность сервера Inngest', {
        description: 'Could not check Inngest server availability',
        error: error instanceof Error ? error.message : String(error),
      })

      // Не возвращаем ошибку, так как сервер может быть недоступен напрямую
      // но API все равно может работать через прокси
    }

    // Все проверки пройдены успешно
    logger.info('✅ Проверка Inngest API завершена успешно', {
      description: 'Inngest API test completed successfully',
    })

    return {
      success: true,
      name: 'Проверка Inngest API',
      message: 'Inngest API доступно и функционирует корректно',
      category: TestCategory.Api,
    }
  } catch (error) {
    logger.error('❌ Критическая ошибка при проверке Inngest API', {
      description: 'Critical error while testing Inngest API',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      name: 'Проверка Inngest API',
      message: 'Критическая ошибка при проверке Inngest API',
      category: TestCategory.Api,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Запускает тест Inngest API
 */
export async function runInngestApiTest(): Promise<TestResult> {
  return await testInngestAPI()
}

// Если файл запущен напрямую, выполняем тест
if (require.main === module) {
  runInngestApiTest()
    .then(result => {
      logger.info('📋 Результат тестирования Inngest API', {
        description: 'Inngest API test result',
        success: result.success,
        message: result.message,
      })

      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      logger.error('❌ Ошибка при запуске теста Inngest API', {
        description: 'Error running Inngest API test',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      process.exit(1)
    })
}
