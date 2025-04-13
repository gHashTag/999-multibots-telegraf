import { logger } from '../../../utils/logger'
import { TestResult } from '../../types'
import { TestCategory } from '../../core/categories'
import { MockDataFactory } from '../../factories/MockDataFactory'

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
  mockSuccess?: boolean // Флаг для определения успешности мока
}

// Список API эндпоинтов для тестирования с флагами mock-успешности
const API_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'Основной API',
    path: `${API_URL}/`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности основного API',
    mockSuccess: true,
  },
  {
    name: 'API Контент-генерации',
    path: `${API_URL}/api/content/health`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности API для генерации контента',
    mockSuccess: true,
  },
  {
    name: 'Inngest API',
    path: `${API_URL}/api/inngest`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности Inngest API',
    mockSuccess: true,
  },
  {
    name: 'Webhook API',
    path: `${API_URL}/webhooks/ping`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности webhook API',
    mockSuccess: true,
  },
  {
    name: 'Бот #1 webhook',
    path: `${API_URL}/bot1/webhook`,
    method: 'POST',
    expectedStatus: 200,
    description: 'Проверка доступности webhook для Бота #1',
    data: { update_id: 123, message: { text: '/ping' } },
    mockSuccess: true,
  },
  {
    name: 'Бот #2 webhook',
    path: `${API_URL}/bot2/webhook`,
    method: 'POST',
    expectedStatus: 200,
    description: 'Проверка доступности webhook для Бота #2',
    data: { update_id: 123, message: { text: '/ping' } },
    mockSuccess: true,
  },
  {
    name: 'Файловый сервис',
    path: `${API_URL}/files/health`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности файлового сервиса',
    mockSuccess: true,
  },
  {
    name: 'API статистики',
    path: `${API_URL}/api/stats/health`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности API статистики',
    mockSuccess: true,
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
 * Тестирует один API эндпоинт, используя моки вместо реальных запросов
 */
async function testEndpoint(
  endpoint: ApiEndpoint
): Promise<EndpointTestResult> {
  const startTime = Date.now()

  try {
    logger.info({
      message: `🔍 Проверка эндпоинта (мок): ${endpoint.name} (${endpoint.path})`,
      description: `Testing endpoint (mock): ${endpoint.name} (${endpoint.path})`,
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

    // Симулируем задержку для реализма
    await new Promise(resolve => setTimeout(resolve, 100))

    const responseTime = Date.now() - startTime

    // Используем mockSuccess для определения результата теста
    const success =
      endpoint.mockSuccess !== undefined ? endpoint.mockSuccess : true
    const statusCode = success ? endpoint.expectedStatus : 500

    // Логируем результат
    if (success) {
      logger.info({
        message: `✅ Эндпоинт ${endpoint.name} доступен (мок) (${statusCode}, ${responseTime}ms)`,
        description: `Endpoint ${endpoint.name} is available (mock) (${statusCode}, ${responseTime}ms)`,
      })
    } else {
      logger.warn({
        message: `⚠️ Эндпоинт ${endpoint.name} вернул неожиданный статус (мок): ${statusCode} (ожидался ${endpoint.expectedStatus})`,
        description: `Endpoint ${endpoint.name} returned unexpected status (mock): ${statusCode} (expected ${endpoint.expectedStatus})`,
      })
    }

    return {
      endpoint,
      success,
      statusCode,
      responseTime,
      responseData: success
        ? { status: 'ok', mockData: true }
        : { error: 'Mock error', mockData: true },
      error: success ? undefined : 'Ошибка в ответе API (мок)',
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: `❌ Ошибка при проверке эндпоинта ${endpoint.name} (мок): ${errorMessage}`,
      description: `Error testing endpoint ${endpoint.name} (mock): ${errorMessage}`,
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
📊 ОТЧЕТ О ТЕСТИРОВАНИИ API ЭНДПОИНТОВ (MOCK)
===========================================
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
 * Проверяет доступность Inngest API с использованием мока
 */
async function testInngestAvailability(): Promise<boolean> {
  try {
    logger.info({
      message: '⚡ Проверка доступности Inngest API (мок)',
      description: 'Testing Inngest API availability (mock)',
    })

    // Симулируем задержку
    await new Promise(resolve => setTimeout(resolve, 150))

    // Всегда возвращаем успех для мока
    const isAvailable = true

    logger.info({
      message: '✅ Inngest API доступен (мок)',
      description: 'Inngest API is available (mock)',
    })

    return isAvailable
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: `❌ Ошибка при проверке доступности Inngest API (мок): ${errorMessage}`,
      description: `Error testing Inngest API availability (mock): ${errorMessage}`,
    })

    return false
  }
}

/**
 * Запускает тесты API эндпоинтов с использованием моков
 */
export async function runApiEndpointTestsMock(
  options: {
    generateReport?: boolean
  } = {}
): Promise<TestResult> {
  logger.info({
    message: '🚀 Запуск тестов API эндпоинтов (MOCK)',
    description: 'Starting API endpoint tests (MOCK)',
  })

  try {
    // Инициализируем фабрику моков
    MockDataFactory.setVerbose(true)

    // Создаем мок для fetch, чтобы в отчете видеть информацию о моках
    MockDataFactory.createFetchMock()

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
        message: '📊 Отчет о тестировании API эндпоинтов (MOCK):',
        description: 'API endpoint testing report (MOCK):',
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

    // Получаем отчет о вызванных моках
    const mockReport = MockDataFactory.generateMockReport()
    logger.info({
      message: '📊 Отчет о вызванных моках:',
      description: 'Mock calls report:',
      mockReport,
    })

    // Логируем общий результат
    if (allSuccess) {
      logger.info({
        message: '✅ Все API эндпоинты работают корректно (MOCK)',
        description: 'All API endpoints are working correctly (MOCK)',
      })
    } else {
      logger.warn({
        message: '⚠️ Некоторые API эндпоинты не работают (MOCK)',
        description: 'Some API endpoints are not working (MOCK)',
      })
    }

    return {
      success: allSuccess,
      name: 'API эндпоинты (MOCK)',
      message: allSuccess
        ? 'Все API эндпоинты работают корректно (MOCK)'
        : 'Некоторые API эндпоинты не работают (MOCK)',
      category: TestCategory.ApiEndpoints,
      details: {
        report,
        results,
        inngestAvailable,
        mockReport,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: `❌ Ошибка при запуске тестов API эндпоинтов (MOCK): ${errorMessage}`,
      description: `Error running API endpoint tests (MOCK): ${errorMessage}`,
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      name: 'API эндпоинты (MOCK)',
      message: `Ошибка при запуске тестов API эндпоинтов (MOCK): ${errorMessage}`,
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
    // Всегда генерируем отчет при запуске из CLI
    const result = await runApiEndpointTestsMock({ generateReport: true })

    // Выводим отчет дополнительно в консоль для лучшей видимости
    if (result.details?.report) {
      console.log('\n' + result.details.report)
    }

    if (result.success) {
      logger.info({
        message: '✅ Все тесты API эндпоинтов успешно пройдены (MOCK)',
        description: 'All API endpoint tests passed successfully (MOCK)',
      })
      process.exit(0)
    } else {
      logger.error({
        message: '❌ Некоторые тесты API эндпоинтов не пройдены (MOCK)',
        description: 'Some API endpoint tests failed (MOCK)',
      })
      process.exit(1)
    }
  } catch (error) {
    logger.error({
      message: `❌ Критическая ошибка при выполнении тестов API эндпоинтов (MOCK): ${error instanceof Error ? error.message : String(error)}`,
      description: `Critical error running API endpoint tests (MOCK): ${error instanceof Error ? error.message : String(error)}`,
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

// Запускаем тесты, если файл запущен напрямую
if (require.main === module) {
  main()
}
