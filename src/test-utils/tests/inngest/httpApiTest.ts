import axios, { AxiosRequestConfig, Method } from 'axios'
import { logger } from '../../../utils/logger'
import { TestResult } from '../../types'
import { TestCategory } from '../../core/categories'
import { TEST_CONFIG } from '../../test-config'

// Базовый URL для API-запросов
const BASE_API_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const INNGEST_API_URL =
  process.env.INNGEST_SERVE_URL || `${BASE_API_URL}/api/inngest`

// Базовые URL для Inngest API
const INNGEST_API_BASE_URL = 'https://api.inngest.com'

// Интерфейс для описания эндпоинта API
interface ApiEndpoint {
  name: string
  url: string
  method: Method
  expectedStatus: number
  description: string
  headers?: Record<string, string>
  data?: any
  timeout?: number
}

// Интерфейс для описания API endpoint
interface InngestEndpoint {
  name: string
  path: string
  method: 'GET' | 'POST'
  requiresAuth: boolean
  description: string
  expectedStatus: number
}

// Список API-эндпоинтов для тестирования
const API_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'Основной API',
    url: `${BASE_API_URL}/api/health`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка основного API сервера',
  },
  {
    name: 'Inngest API',
    url: INNGEST_API_URL,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности Inngest API',
  },
  {
    name: 'Inngest Dev Tools',
    url: `${INNGEST_API_URL}/dev`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности инструментов разработчика Inngest',
  },
]

/**
 * Список эндпоинтов Inngest API для проверки
 */
const INNGEST_ENDPOINTS: InngestEndpoint[] = [
  {
    name: 'Health Check',
    path: '/v0/health',
    method: 'GET',
    requiresAuth: false,
    expectedStatus: 200,
    description: 'Проверка работоспособности Inngest API',
  },
  {
    name: 'Event API',
    path: '/v0/events',
    method: 'POST',
    requiresAuth: true,
    expectedStatus: 200,
    description: 'Отправка событий через Inngest API',
  },
  // Можно добавить другие эндпоинты по мере необходимости
]

/**
 * Результат проверки одного эндпоинта
 */
interface EndpointTestResult {
  endpoint: InngestEndpoint
  success: boolean
  statusCode?: number
  error?: string
  responseTime?: number
}

/**
 * Тестирует отдельный эндпоинт Inngest API
 */
async function testEndpoint(
  endpoint: InngestEndpoint
): Promise<EndpointTestResult> {
  const startTime = Date.now()
  let statusCode: number | undefined

  try {
    logger.info(`🔍 Проверка эндпоинта Inngest API: ${endpoint.name}`, {
      description: `Testing Inngest API endpoint: ${endpoint.name}`,
      endpoint: endpoint.path,
      method: endpoint.method,
    })

    const url = `${INNGEST_API_BASE_URL}${endpoint.path}`
    const config: any = {
      method: endpoint.method,
      url,
      timeout: 10000, // 10 секунд таймаут
    }

    // Добавление API ключа для авторизованных запросов
    if (endpoint.requiresAuth && process.env.INNGEST_EVENT_KEY) {
      config.headers = {
        Authorization: `Bearer ${process.env.INNGEST_EVENT_KEY}`,
      }

      // Для POST запросов добавляем тестовые данные
      if (endpoint.method === 'POST') {
        config.data = {
          name: 'test/http.api.connection',
          data: {
            testId: `api-test-${Date.now()}`,
            timestamp: new Date().toISOString(),
          },
        }
      }
    }

    const response = await axios(config)
    statusCode = response.status

    const responseTime = Date.now() - startTime

    logger.info(`✅ Успешная проверка эндпоинта ${endpoint.name}`, {
      description: `Successfully tested endpoint: ${endpoint.name}`,
      statusCode,
      responseTime: `${responseTime}ms`,
    })

    return {
      endpoint,
      success: statusCode >= 200 && statusCode < 300,
      statusCode,
      responseTime,
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime
    const errorMessage = error.response
      ? `Status: ${error.response.status} - ${error.response.statusText}`
      : error.message

    statusCode = error.response?.status

    logger.error(`❌ Ошибка при проверке эндпоинта ${endpoint.name}`, {
      description: `Error testing endpoint: ${endpoint.name}`,
      error: errorMessage,
      statusCode,
      responseTime: `${responseTime}ms`,
    })

    return {
      endpoint,
      success: false,
      statusCode,
      error: errorMessage,
      responseTime,
    }
  }
}

/**
 * Тестирует доступность Inngest через HTTP API
 */
export async function testInngestHttpApi(): Promise<TestResult> {
  logger.info('🚀 Запуск теста Inngest HTTP API', {
    description: 'Running Inngest HTTP API test',
  })

  try {
    const endpointResults: EndpointTestResult[] = []

    // Тестирование каждого эндпоинта
    for (const endpoint of INNGEST_ENDPOINTS) {
      const result = await testEndpoint(endpoint)
      endpointResults.push(result)
    }

    // Проверка общего результата
    const allSuccessful = endpointResults.every(result => result.success)
    const successCount = endpointResults.filter(result => result.success).length

    if (allSuccessful) {
      logger.info('✅ Все эндпоинты Inngest API доступны', {
        description: 'All Inngest API endpoints are accessible',
        successCount,
        totalCount: endpointResults.length,
      })

      return {
        name: 'Тест HTTP API Inngest',
        category: TestCategory.Inngest,
        success: true,
        message: `Все эндпоинты Inngest API (${successCount}/${endpointResults.length}) доступны и работают`,
      }
    } else {
      const failedEndpoints = endpointResults
        .filter(result => !result.success)
        .map(result => result.endpoint.name)
        .join(', ')

      logger.warn('⚠️ Некоторые эндпоинты Inngest API недоступны', {
        description: 'Some Inngest API endpoints are not accessible',
        successCount,
        totalCount: endpointResults.length,
        failedEndpoints,
      })

      return {
        name: 'Тест HTTP API Inngest',
        category: TestCategory.Inngest,
        success: successCount > 0, // Тест считается успешным, если хотя бы один эндпоинт доступен
        message: `${successCount}/${endpointResults.length} эндпоинтов Inngest API доступны. Недоступны: ${failedEndpoints}`,
      }
    }
  } catch (error: any) {
    let errorMessage = 'Неизвестная ошибка'

    if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error)
    }

    logger.error('❌ Ошибка при тестировании HTTP API Inngest', {
      description: 'Error in Inngest HTTP API test',
      error: errorMessage,
    })

    return {
      name: 'Тест HTTP API Inngest',
      category: TestCategory.Inngest,
      success: false,
      message: `Ошибка при проверке HTTP API Inngest: ${errorMessage}`,
      error: errorMessage,
    }
  }
}

/**
 * Тестирование всех API эндпоинтов
 */
export async function runHttpApiTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск всех тестов HTTP API', {
    description: 'Running all HTTP API tests',
  })

  const results: TestResult[] = []

  try {
    // Тест Inngest HTTP API
    const inngestApiResult = await testInngestHttpApi()
    results.push(inngestApiResult)

    // Тестируем каждый эндпоинт из списка API_ENDPOINTS
    for (const endpoint of API_ENDPOINTS) {
      try {
        logger.info(`🔍 Тестирование общего API эндпоинта: ${endpoint.name}`, {
          description: `Testing general API endpoint: ${endpoint.name}`,
          url: endpoint.url,
        })

        const config: AxiosRequestConfig = {
          method: endpoint.method,
          url: endpoint.url,
          headers: endpoint.headers || {},
          data: endpoint.data,
          timeout: endpoint.timeout || TEST_CONFIG.TIMEOUTS.MEDIUM,
        }

        const startTime = Date.now()
        const response = await axios(config)
        const duration = Date.now() - startTime

        const success = response.status === endpoint.expectedStatus

        if (success) {
          logger.info(
            `✅ Эндпоинт ${endpoint.name} доступен! Время ответа: ${duration}ms`
          )
        } else {
          logger.warn(
            `⚠️ Эндпоинт ${endpoint.name} вернул неожиданный статус: ${response.status} (ожидался ${endpoint.expectedStatus})`
          )
        }

        results.push({
          success,
          name: `API Тест: ${endpoint.name}`,
          message: success
            ? `Эндпоинт успешно отвечает. Статус: ${response.status}. Время ответа: ${duration}ms`
            : `Эндпоинт вернул неожиданный статус: ${response.status} (ожидался ${endpoint.expectedStatus})`,
          category: TestCategory.Api,
          details: {
            endpoint: endpoint.url,
            statusCode: response.status,
            expectedStatusCode: endpoint.expectedStatus,
            responseTime: duration,
          },
        })
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)

        logger.error(
          `❌ Ошибка при тестировании эндпоинта ${endpoint.name}: ${errorMessage}`
        )

        results.push({
          success: false,
          name: `API Тест: ${endpoint.name}`,
          message: `Ошибка при тестировании эндпоинта: ${errorMessage}`,
          category: TestCategory.Api,
          details: {
            endpoint: endpoint.url,
            error: errorMessage,
          },
        })
      }
    }

    // Статистика результатов
    const successCount = results.filter(result => result.success).length

    logger.info(
      `🏁 Завершены все тесты HTTP API: ${successCount}/${results.length} успешно`,
      {
        description: `Completed all HTTP API tests: ${successCount}/${results.length} successful`,
      }
    )

    return results
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error('❌ Ошибка при запуске тестов HTTP API', {
      description: 'Error running HTTP API tests',
      error: errorMessage,
    })

    return [
      {
        name: 'Тесты HTTP API',
        category: TestCategory.Inngest,
        success: false,
        message: `Ошибка при запуске тестов HTTP API: ${errorMessage}`,
        error: errorMessage,
      },
    ]
  }
}

/**
 * Генерация отчета о доступности API
 */
export function generateApiReport(results: TestResult[]): string {
  const successCount = results.filter(r => r.success).length
  const totalCount = results.length
  const successRate = Math.round((successCount / totalCount) * 100)

  let report = `🔍 ОТЧЕТ О ДОСТУПНОСТИ API\n`
  report += `======================================\n`
  report += `✅ Успешно: ${successCount}/${totalCount} (${successRate}%)\n`
  report += `❌ Ошибки: ${totalCount - successCount}\n`
  report += `======================================\n\n`

  report += `ДЕТАЛИЗАЦИЯ:\n`

  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌'
    report += `${index + 1}. ${status} ${result.name}\n`
    report += `   ${result.message}\n`
    if (result.details) {
      const responseTime = result.details.responseTime
        ? `Время ответа: ${result.details.responseTime}ms`
        : ''
      report += `   ${responseTime}\n`
    }
    report += `\n`
  })

  return report
}

// Экспорт всех функций для тестирования
export default {
  testInngestHttpApi,
  runHttpApiTests,
  generateApiReport,
}
