import axios from 'axios'
import { logger } from '../../../utils/logger'
import { TestResult } from '../../types'
import { TEST_CONFIG } from '../../test-config'
import { TestCategory } from '../../core/categories'

// Базовый URL API
const API_URL = process.env.API_URL || 'http://localhost:2999'

// Интерфейс для описания API эндпоинта
interface ApiEndpoint {
  name: string
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  expectedStatus: number
  description: string
  headers?: Record<string, string>
  data?: any
  disabled?: boolean
  requiresAuth?: boolean
  testWithBody?: boolean
  expectedResponsePattern?: RegExp | string
}

// Список API эндпоинтов для тестирования
const API_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'Основной API',
    path: `${API_URL}/`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности основного API',
  },
  {
    name: 'API Контент-генерации',
    path: `${API_URL}/api/content/health`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности API для генерации контента',
  },
  {
    name: 'Inngest API',
    path: `${API_URL}/api/inngest`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности Inngest API',
  },
  {
    name: 'Webhook API',
    path: `${API_URL}/webhooks/ping`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности webhook API',
  },
  {
    name: 'Бот #1 webhook',
    path: `${API_URL}/bot1/webhook`,
    method: 'POST',
    expectedStatus: 200,
    description: 'Проверка доступности webhook для Бота #1',
    data: { update_id: 123, message: { text: '/ping' } },
  },
  {
    name: 'Бот #2 webhook',
    path: `${API_URL}/bot2/webhook`,
    method: 'POST',
    expectedStatus: 200,
    description: 'Проверка доступности webhook для Бота #2',
    data: { update_id: 123, message: { text: '/ping' } },
  },
  {
    name: 'Файловый сервис',
    path: `${API_URL}/files/health`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности файлового сервиса',
  },
  {
    name: 'API статистики',
    path: `${API_URL}/api/stats/health`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности API статистики',
  },
]

// Результаты тестирования эндпоинтов
interface EndpointTestResult {
  endpoint: ApiEndpoint
  success: boolean
  error?: string
  statusCode?: number
  responseTime: number
  responseData?: any
}

/**
 * Тестирует один API эндпоинт
 */
async function testEndpoint(
  endpoint: ApiEndpoint
): Promise<EndpointTestResult> {
  const startTime = Date.now()

  try {
    logger.info({
      message: `🔍 Проверка эндпоинта: ${endpoint.name} (${endpoint.path})`,
      description: `Testing endpoint: ${endpoint.name} (${endpoint.path})`,
    })

    // Пропускаем отключенные эндпоинты
    if (endpoint.disabled) {
      logger.info({
        message: `⏭️ Эндпоинт ${endpoint.name} отключен, пропускаем`,
        description: `Endpoint ${endpoint.name} is disabled, skipping`,
      })
      return {
        endpoint,
        success: true,
        responseTime: 0,
        statusCode: 0,
      }
    }

    // Настраиваем заголовки запроса
    const headers = {
      'Content-Type': 'application/json',
      ...endpoint.headers,
    }

    // Выполняем запрос
    const response = await axios({
      method: endpoint.method,
      url: endpoint.path,
      timeout: TEST_CONFIG.TIMEOUTS.MEDIUM,
      headers,
      data: endpoint.data,
      validateStatus: () => true, // Не выбрасывать ошибку для любого статуса ответа
    })

    const responseTime = Date.now() - startTime

    // Проверяем статус ответа
    const isStatusCorrect = response.status === endpoint.expectedStatus

    // Проверяем содержимое ответа, если задан паттерн
    let isContentCorrect = true
    if (endpoint.expectedResponsePattern && response.data) {
      const responseStr =
        typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data)

      isContentCorrect =
        endpoint.expectedResponsePattern instanceof RegExp
          ? endpoint.expectedResponsePattern.test(responseStr)
          : responseStr.includes(endpoint.expectedResponsePattern)
    }

    // Определяем успешность теста
    const success = isStatusCorrect && isContentCorrect

    // Логируем результат
    if (success) {
      logger.info({
        message: `✅ Эндпоинт ${endpoint.name} доступен (${response.status}, ${responseTime}ms)`,
        description: `Endpoint ${endpoint.name} is available (${response.status}, ${responseTime}ms)`,
      })
    } else {
      if (!isStatusCorrect) {
        logger.warn({
          message: `⚠️ Эндпоинт ${endpoint.name} вернул неожиданный статус: ${response.status} (ожидался ${endpoint.expectedStatus})`,
          description: `Endpoint ${endpoint.name} returned unexpected status: ${response.status} (expected ${endpoint.expectedStatus})`,
        })
      }

      if (!isContentCorrect) {
        logger.warn({
          message: `⚠️ Эндпоинт ${endpoint.name} вернул неожиданное содержимое`,
          description: `Endpoint ${endpoint.name} returned unexpected content`,
        })
      }
    }

    return {
      endpoint,
      success,
      statusCode: response.status,
      responseTime,
      responseData: response.data,
      error: success ? undefined : 'Ошибка в ответе API',
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: `❌ Ошибка при проверке эндпоинта ${endpoint.name}: ${errorMessage}`,
      description: `Error testing endpoint ${endpoint.name}: ${errorMessage}`,
    })

    return {
      endpoint,
      success: false,
      error: errorMessage,
      responseTime,
    }
  }
}

/**
 * Генерирует отчет о тестировании API эндпоинтов
 */
function generateApiTestReport(results: EndpointTestResult[]): string {
  const totalEndpoints = results.length
  const workingEndpoints = results.filter(r => r.success).length
  const failedEndpoints = results.filter(r => !r.success).length
  const disabledEndpoints = results.filter(r => r.endpoint.disabled).length
  const activeEndpoints = totalEndpoints - disabledEndpoints

  const successRate =
    activeEndpoints > 0
      ? Math.round((workingEndpoints / activeEndpoints) * 100)
      : 0

  let report = `
📊 ОТЧЕТ О ТЕСТИРОВАНИИ API ЭНДПОИНТОВ
======================================
📅 Дата: ${new Date().toLocaleString()}
📈 Результаты:
  ✅ Работающие эндпоинты: ${workingEndpoints}/${activeEndpoints} (${successRate}%)
  ❌ Неработающие эндпоинты: ${failedEndpoints}
  ⏸️ Отключенные эндпоинты: ${disabledEndpoints}
  🔄 Всего эндпоинтов: ${totalEndpoints}

📋 Детальный отчет:
`

  // Добавляем информацию о каждом эндпоинте
  results.forEach(result => {
    const statusEmoji = result.endpoint.disabled
      ? '⏸️'
      : result.success
        ? '✅'
        : '❌'

    const statusText = result.endpoint.disabled
      ? 'ОТКЛЮЧЕН'
      : result.success
        ? 'РАБОТАЕТ'
        : 'НЕ РАБОТАЕТ'

    const statusCode = result.statusCode ? `(код: ${result.statusCode})` : ''

    const responseTime = result.responseTime
      ? `${result.responseTime}ms`
      : 'N/A'

    report += `
${statusEmoji} ${result.endpoint.name} - ${statusText} ${statusCode}
  📝 Описание: ${result.endpoint.description}
  🔗 URL: ${result.endpoint.path}
  🔄 Метод: ${result.endpoint.method}
  ⏱️ Время ответа: ${responseTime}`

    if (result.error) {
      report += `
  ❌ Ошибка: ${result.error}`
    }

    report += '\n'
  })

  return report
}

/**
 * Проверяет доступность Inngest API
 */
async function testInngestAvailability(): Promise<boolean> {
  try {
    logger.info({
      message: '⚡ Проверка доступности Inngest API',
      description: 'Testing Inngest API availability',
    })

    const response = await axios({
      method: 'GET',
      url: `${API_URL}/api/inngest`,
      timeout: TEST_CONFIG.TIMEOUTS.MEDIUM,
      validateStatus: () => true,
    })

    const isAvailable = response.status === 200

    if (isAvailable) {
      logger.info({
        message: '✅ Inngest API доступен',
        description: 'Inngest API is available',
      })
    } else {
      logger.warn({
        message: `⚠️ Inngest API недоступен (${response.status})`,
        description: `Inngest API is not available (${response.status})`,
      })
    }

    return isAvailable
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: `❌ Ошибка при проверке доступности Inngest API: ${errorMessage}`,
      description: `Error testing Inngest API availability: ${errorMessage}`,
    })

    return false
  }
}

/**
 * Запускает тесты API эндпоинтов
 */
export async function runApiEndpointTests(
  options: {
    generateReport?: boolean
  } = {}
): Promise<TestResult> {
  logger.info({
    message: '🚀 Запуск тестов API эндпоинтов',
    description: 'Starting API endpoint tests',
  })

  try {
    // Тестируем все эндпоинты
    const results: EndpointTestResult[] = []

    for (const endpoint of API_ENDPOINTS) {
      const result = await testEndpoint(endpoint)
      results.push(result)
    }

    // Проверяем доступность Inngest API
    const inngestAvailable = await testInngestAvailability()

    // Считаем результаты
    const activeResults = results.filter(r => !r.endpoint.disabled)
    const allSuccess = activeResults.every(r => r.success) && inngestAvailable

    // Генерируем отчет, если требуется
    let report: string | undefined
    if (options.generateReport) {
      report = generateApiTestReport(results)

      // Выводим отчет в лог
      logger.info({
        message: '📊 Отчет о тестировании API эндпоинтов:',
        description: 'API endpoint testing report:',
      })

      // Разделяем отчет на строки для лучшей читаемости в логах
      report.split('\n').forEach(line => {
        if (line.trim()) {
          logger.info({
            message: line,
            description: line,
          })
        }
      })
    }

    // Логируем общий результат
    if (allSuccess) {
      logger.info({
        message: '✅ Все API эндпоинты работают корректно',
        description: 'All API endpoints are working correctly',
      })
    } else {
      logger.warn({
        message: '⚠️ Некоторые API эндпоинты не работают',
        description: 'Some API endpoints are not working',
      })
    }

    return {
      success: allSuccess,
      name: 'API эндпоинты',
      message: allSuccess
        ? 'Все API эндпоинты работают корректно'
        : 'Некоторые API эндпоинты не работают',
      category: TestCategory.ApiEndpoints,
      details: {
        report,
        results,
        inngestAvailable,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: `❌ Ошибка при запуске тестов API эндпоинтов: ${errorMessage}`,
      description: `Error running API endpoint tests: ${errorMessage}`,
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      name: 'API эндпоинты',
      message: `Ошибка при запуске тестов API эндпоинтов: ${errorMessage}`,
      category: TestCategory.ApiEndpoints,
      error: errorMessage,
    }
  }
}

/**
 * Функция для запуска из CLI
 */
async function main() {
  try {
    const result = await runApiEndpointTests({ generateReport: true })

    if (result.success) {
      logger.info({
        message: '✅ Все тесты API эндпоинтов успешно пройдены',
        description: 'All API endpoint tests passed successfully',
      })
      process.exit(0)
    } else {
      logger.error({
        message: '❌ Некоторые тесты API эндпоинтов не пройдены',
        description: 'Some API endpoint tests failed',
      })
      process.exit(1)
    }
  } catch (error) {
    logger.error({
      message: `❌ Критическая ошибка при выполнении тестов API эндпоинтов: ${error instanceof Error ? error.message : String(error)}`,
      description: `Critical error running API endpoint tests: ${error instanceof Error ? error.message : String(error)}`,
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

// Запускаем тесты, если файл запущен напрямую
if (require.main === module) {
  main()
}
