/**
 * API Health Test - Тест доступности API эндпоинтов
 *
 * Этот тест проверяет доступность и функциональность различных API эндпоинтов,
 * включая основной API, Inngest API, вебхуки и эндпоинты ботов.
 */

import { TestResult } from '../types'
import fetch from 'node-fetch'
import { logger } from '../../utils/logger'
import { TestCategory } from '../core/categories'

// Базовый URL для API запросов
const BASE_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://api.neuroblogger.com'
    : 'http://localhost:2999'

/**
 * Интерфейс для описания API-эндпоинта
 */
interface ApiEndpoint {
  /** Название эндпоинта */
  name: string
  /** Путь к эндпоинту */
  path: string
  /** HTTP метод */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** Ожидаемый статус ответа */
  expectedStatus: number
  /** Описание эндпоинта */
  description: string
  /** Дополнительные заголовки (опционально) */
  headers?: Record<string, string>
  /** Тело запроса (опционально) */
  data?: any
  /** Отключен ли эндпоинт для проверки (опционально) */
  disabled?: boolean
  /** Функция для дополнительной проверки ответа (опционально) */
  validate?: (response: any) => { success: boolean; message?: string }
  /** Категория эндпоинта (опционально) */
  category?: TestCategory
  /** Требует ли эндпоинт авторизацию (опционально) */
  requiresAuth?: boolean
}

/**
 * Список API эндпоинтов для тестирования
 */
const API_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'Main API',
    path: '/api',
    method: 'GET',
    expectedStatus: 200,
    description: 'Основной API эндпоинт',
  },
  {
    name: 'API Health',
    path: '/api/health',
    method: 'GET',
    expectedStatus: 200,
    description: 'Эндпоинт проверки состояния API',
  },
  {
    name: 'Inngest API',
    path: '/api/inngest',
    method: 'GET',
    expectedStatus: 200,
    description: 'Эндпоинт Inngest API',
  },
  {
    name: 'Webhooks',
    path: '/api/webhooks',
    method: 'GET',
    expectedStatus: 200,
    description: 'Эндпоинт для вебхуков',
  },
  {
    name: 'Bot Webhook',
    path: '/api/bot-webhook',
    method: 'GET',
    expectedStatus: 200,
    description: 'Эндпоинт для вебхуков бота',
  },
]

/**
 * Тестирует доступность и функциональность указанного API эндпоинта
 * @param endpoint Эндпоинт для тестирования
 * @returns Promise<{success: boolean, error?: string}>
 */
async function testEndpoint(
  endpoint: ApiEndpoint
): Promise<{ success: boolean; error?: string }> {
  const url = `${BASE_URL}${endpoint.path}`

  try {
    logger.info({
      message: `🔍 Тестирование API эндпоинта: ${endpoint.name}`,
      description: `Testing API endpoint: ${endpoint.name}`,
      url,
      method: endpoint.method,
    })

    const response = await fetch(url, { method: endpoint.method })
    const status = response.status

    if (status === endpoint.expectedStatus) {
      logger.info({
        message: `✅ API эндпоинт доступен: ${endpoint.name}`,
        description: `API endpoint available: ${endpoint.name}`,
        statusCode: status,
      })
      return { success: true }
    } else {
      logger.error({
        message: `❌ API эндпоинт вернул неправильный статус: ${endpoint.name}`,
        description: `API endpoint returned wrong status: ${endpoint.name}`,
        expectedStatus: endpoint.expectedStatus,
        actualStatus: status,
      })
      return {
        success: false,
        error: `Expected status ${endpoint.expectedStatus}, got ${status}`,
      }
    }
  } catch (error) {
    logger.error({
      message: `❌ Ошибка при тестировании API эндпоинта: ${endpoint.name}`,
      description: `Error testing API endpoint: ${endpoint.name}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Запускает тесты для всех API эндпоинтов
 * @param generateReport Флаг для генерации отчета
 * @returns Promise<TestResult>
 */
export async function runApiTests(
  generateReport: boolean = false
): Promise<TestResult> {
  try {
    logger.info({
      message: '🚀 Запуск тестов API эндпоинтов',
      description: 'Starting API endpoints tests',
      timestamp: new Date().toISOString(),
    })

    const results = await Promise.all(API_ENDPOINTS.map(testEndpoint))
    const failedTests = results.filter(result => !result.success)

    if (failedTests.length === 0) {
      const successMessage = '✅ Все API эндпоинты доступны'
      logger.info({
        message: successMessage,
        description: 'All API endpoints are available',
        timestamp: new Date().toISOString(),
      })

      if (generateReport) {
        await generateApiTestReport(results, API_ENDPOINTS)
      }

      return {
        success: true,
        message: successMessage,
        name: 'API Health Test',
        category: TestCategory.API,
      }
    } else {
      const failedEndpoints = API_ENDPOINTS.filter(
        (_, index) => !results[index].success
      )
        .map(endpoint => endpoint.name)
        .join(', ')

      const errorMessage = `❌ Некоторые API эндпоинты недоступны: ${failedEndpoints}`
      logger.error({
        message: errorMessage,
        description: 'Some API endpoints are not available',
        failedEndpoints,
        timestamp: new Date().toISOString(),
      })

      if (generateReport) {
        await generateApiTestReport(results, API_ENDPOINTS)
      }

      return {
        success: false,
        message: errorMessage,
        name: 'API Health Test',
        category: TestCategory.API,
        error: new Error(errorMessage),
      }
    }
  } catch (error) {
    const errorMessage = '❌ Ошибка при запуске тестов API эндпоинтов'
    logger.error({
      message: errorMessage,
      description: 'Error running API endpoints tests',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    })

    return {
      success: false,
      message: errorMessage,
      name: 'API Health Test',
      category: TestCategory.API,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

/**
 * Генерирует отчет о результатах тестирования API эндпоинтов
 * @param results Результаты тестирования
 * @param endpoints Список эндпоинтов
 */
async function generateApiTestReport(
  results: { success: boolean; error?: string }[],
  endpoints: ApiEndpoint[]
): Promise<void> {
  try {
    logger.info({
      message: '📊 Генерация отчета о тестировании API',
      description: 'Generating API test report',
      timestamp: new Date().toISOString(),
    })

    const report = {
      timestamp: new Date().toISOString(),
      totalEndpoints: endpoints.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: endpoints.map((endpoint, index) => ({
        name: endpoint.name,
        path: endpoint.path,
        method: endpoint.method,
        success: results[index].success,
        error: results[index].error || null,
      })),
    }

    // Выводим отчет в консоль
    logger.info({
      message: '📑 Отчет о тестировании API',
      description: 'API test report',
      report,
      timestamp: new Date().toISOString(),
    })

    // Здесь можно добавить сохранение отчета в файл или отправку его куда-либо
    // ...
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при генерации отчета о тестировании API',
      description: 'Error generating API test report',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    })
  }
}

/**
 * Тестирует доступность Inngest API
 * @returns Promise<TestResult>
 */
async function testInngestAvailability(): Promise<TestResult> {
  try {
    logger.info({
      message: '🚀 Проверка доступности Inngest API',
      description: 'Testing Inngest API availability',
      timestamp: new Date().toISOString(),
    })

    const url = `${BASE_URL}/api/inngest`
    const response = await fetch(url)

    if (response.status === 200) {
      const successMessage = '✅ Inngest API доступен'
      logger.info({
        message: successMessage,
        description: 'Inngest API is available',
        timestamp: new Date().toISOString(),
      })

      return {
        success: true,
        message: successMessage,
        name: 'Inngest API Availability Test',
        category: TestCategory.Inngest,
      }
    } else {
      const errorMessage = `❌ Inngest API недоступен (статус: ${response.status})`
      logger.error({
        message: errorMessage,
        description: 'Inngest API is not available',
        statusCode: response.status,
        timestamp: new Date().toISOString(),
      })

      return {
        success: false,
        message: errorMessage,
        name: 'Inngest API Availability Test',
        category: TestCategory.Inngest,
        error: new Error(errorMessage),
      }
    }
  } catch (error) {
    const errorMessage = '❌ Ошибка при проверке доступности Inngest API'
    logger.error({
      message: errorMessage,
      description: 'Error testing Inngest API availability',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    })

    return {
      success: false,
      message: errorMessage,
      name: 'Inngest API Availability Test',
      category: TestCategory.Inngest,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

export { testInngestAvailability, runApiTests }

// Прямой запуск файла
if (require.main === module) {
  runApiTests({ generateReport: true })
    .then(() => {
      logger.info('✅ [API_TEST]: Тест API завершен')
      process.exit(0)
    })
    .catch(error => {
      logger.error('❌ [API_TEST]: Ошибка при выполнении теста API:', error)
      process.exit(1)
    })
}
