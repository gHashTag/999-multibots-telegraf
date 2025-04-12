import axios from 'axios'
import { logger } from '@/utils/logger'
import { TestResult } from '../../types'
import { TestCategory } from '../../core/categories'
import { TEST_CONFIG } from '../../test-config'

// Базовый URL для API-запросов
const BASE_API_URL = process.env.API_URL || 'http://localhost:2999'

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
}

/**
 * Список API эндпоинтов для тестирования
 */
const API_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'Главный API',
    path: '/',
    method: 'GET',
    expectedStatus: 200,
    description: 'Основной эндпоинт API',
  },
  {
    name: 'Статус сервера',
    path: '/api/status',
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка статуса сервера',
    validate: response => {
      // Проверяем, что ответ содержит необходимые поля
      if (typeof response.data !== 'object') {
        return { success: false, message: 'Ответ не является объектом' }
      }

      const requiredFields = ['status', 'version', 'timestamp']
      const missingFields = requiredFields.filter(
        field => !(field in response.data)
      )

      if (missingFields.length > 0) {
        return {
          success: false,
          message: `Отсутствуют обязательные поля: ${missingFields.join(', ')}`,
        }
      }

      return { success: true }
    },
  },
  // Следующие эндпоинты отключены, так как они не реализованы в отладочном сервере
  {
    name: 'API Inngest',
    path: '/api/inngest',
    method: 'POST',
    expectedStatus: 200,
    description: 'Эндпоинт для Inngest функций',
    disabled: true,
    data: {
      name: 'test/api-check',
      data: {
        timestamp: Date.now(),
        source: 'api-full-test',
        test: true,
      },
    },
    headers: {
      'X-Inngest-Test': 'true',
      'Content-Type': 'application/json',
    },
  },
  {
    name: 'Inngest Dev',
    path: '/api/inngest/dev',
    method: 'GET',
    expectedStatus: 200,
    description: 'Inngest dev инструменты',
    disabled: true,
  },
  {
    name: 'API Вебхук',
    path: '/api/webhook',
    method: 'POST',
    expectedStatus: 200,
    description: 'Эндпоинт для вебхуков',
    disabled: true,
    data: {
      test: true,
      source: 'api-test',
      timestamp: Date.now(),
    },
    headers: {
      'Content-Type': 'application/json',
    },
  },
  {
    name: 'Файлы',
    path: '/uploads/test.txt',
    method: 'GET',
    expectedStatus: 404,
    description: 'Доступ к загруженным файлам',
    disabled: true,
  },
  {
    name: 'Вебхук Нейрофото',
    path: '/webhooks/neurophoto',
    method: 'POST',
    expectedStatus: 400, // Без правильных данных должен вернуть ошибку
    description: 'Вебхук для нейрофото',
    disabled: true,
    data: {
      test: true,
      source: 'api-test',
    },
    headers: {
      'Content-Type': 'application/json',
    },
  },
]

/**
 * Тестирует один API эндпоинт
 */
async function testEndpoint(endpoint: ApiEndpoint): Promise<{
  endpoint: ApiEndpoint
  success: boolean
  statusCode?: number
  responseTime?: number
  error?: string
  validationResult?: { success: boolean; message?: string }
}> {
  try {
    const url = `${BASE_API_URL}${endpoint.path}`
    const startTime = Date.now()

    logger.info({
      message: `🔍 Тестирование эндпоинта: ${endpoint.name}`,
      description: `Testing endpoint: ${endpoint.name}`,
      url,
      method: endpoint.method,
    })

    // Если эндпоинт отключен, пропускаем его
    if (endpoint.disabled) {
      logger.info({
        message: `⏩ Пропуск отключенного эндпоинта: ${endpoint.name}`,
        description: `Skipping disabled endpoint: ${endpoint.name}`,
      })

      return {
        endpoint,
        success: true,
      }
    }

    // Отправляем запрос
    const response = await axios({
      method: endpoint.method,
      url,
      headers: endpoint.headers || {},
      data: endpoint.data,
      timeout: TEST_CONFIG.TIMEOUTS?.MEDIUM || 5000,
      validateStatus: () => true, // Принимаем любой статус ответа
    })

    const responseTime = Date.now() - startTime
    const statusCode = response.status
    const statusMatch = statusCode === endpoint.expectedStatus

    // Проверяем статус
    if (!statusMatch) {
      logger.warn({
        message: `⚠️ Эндпоинт ${endpoint.name} вернул неожиданный статус ${statusCode} (ожидался ${endpoint.expectedStatus})`,
        description: `Endpoint ${endpoint.name} returned unexpected status ${statusCode} (expected ${endpoint.expectedStatus})`,
        responseTime,
      })

      return {
        endpoint,
        success: false,
        statusCode,
        responseTime,
        error: `Неожиданный статус: ${statusCode}, ожидался: ${endpoint.expectedStatus}`,
      }
    }

    // Если есть функция валидации, проверяем ответ
    let validationResult
    if (endpoint.validate) {
      validationResult = endpoint.validate(response)

      if (!validationResult.success) {
        logger.warn({
          message: `⚠️ Эндпоинт ${endpoint.name} не прошел валидацию: ${validationResult.message}`,
          description: `Endpoint ${endpoint.name} failed validation: ${validationResult.message}`,
          responseTime,
        })

        return {
          endpoint,
          success: false,
          statusCode,
          responseTime,
          error: `Ошибка валидации: ${validationResult.message}`,
          validationResult,
        }
      }
    }

    // Все проверки пройдены успешно
    logger.info({
      message: `✅ Эндпоинт ${endpoint.name} доступен (${statusCode}) за ${responseTime}ms`,
      description: `Endpoint ${endpoint.name} is available (${statusCode}) in ${responseTime}ms`,
      validationPassed: validationResult?.success,
    })

    return {
      endpoint,
      success: true,
      statusCode,
      responseTime,
      validationResult,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: `❌ Ошибка при тестировании эндпоинта ${endpoint.name}: ${errorMessage}`,
      description: `Error testing endpoint ${endpoint.name}: ${errorMessage}`,
      error: errorMessage,
    })

    return {
      endpoint,
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Проверяет доступность Inngest API
 */
async function testInngestConnectivity(): Promise<{
  success: boolean
  message: string
  error?: string
  responseTime?: number
}> {
  try {
    logger.info({
      message: '🔍 Проверка подключения к Inngest',
      description: 'Testing Inngest connectivity',
    })

    const url = process.env.INNGEST_URL || 'https://api.inngest.com/e/v1/events'
    const startTime = Date.now()

    // Отправляем запрос к Inngest API
    const response = await axios({
      method: 'GET',
      url,
      timeout: TEST_CONFIG.TIMEOUTS?.MEDIUM || 5000,
      validateStatus: () => true, // Принимаем любой статус
    })

    const responseTime = Date.now() - startTime

    // Если статус 401, это нормально (требуется аутентификация)
    // Главное, что сервер доступен
    if (response.status === 401 || response.status === 200) {
      logger.info({
        message: `✅ Inngest API доступен (${response.status}) за ${responseTime}ms`,
        description: `Inngest API is available (${response.status}) in ${responseTime}ms`,
      })

      return {
        success: true,
        message: `Inngest API доступен (${response.status})`,
        responseTime,
      }
    } else {
      logger.warn({
        message: `⚠️ Inngest API вернул неожиданный статус: ${response.status}`,
        description: `Inngest API returned unexpected status: ${response.status}`,
        responseTime,
      })

      return {
        success: false,
        message: `Inngest API вернул неожиданный статус: ${response.status}`,
        error: `Неожиданный статус: ${response.status}`,
        responseTime,
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: `❌ Ошибка при проверке подключения к Inngest: ${errorMessage}`,
      description: `Error testing Inngest connectivity: ${errorMessage}`,
      error: errorMessage,
    })

    return {
      success: false,
      message: 'Ошибка при проверке подключения к Inngest',
      error: errorMessage,
    }
  }
}

/**
 * Генерирует отчет о результатах теста
 */
function generateTestReport(
  apiResults: Array<{
    endpoint: ApiEndpoint
    success: boolean
    statusCode?: number
    responseTime?: number
    error?: string
    validationResult?: { success: boolean; message?: string }
  }>,
  inngestResult: {
    success: boolean
    message: string
    error?: string
    responseTime?: number
  }
): string {
  const timestamp = new Date().toISOString()
  const totalEndpoints = apiResults.length
  const successfulEndpoints = apiResults.filter(r => r.success).length
  const failedEndpoints = totalEndpoints - successfulEndpoints
  const successRate = (successfulEndpoints / totalEndpoints) * 100

  let report = `# API Full Test Report\n\n`
  report += `Generated: ${timestamp}\n\n`

  // Общая статистика
  report += `## Summary\n\n`
  report += `- Total API endpoints tested: ${totalEndpoints}\n`
  report += `- Successful: ${successfulEndpoints}\n`
  report += `- Failed: ${failedEndpoints}\n`
  report += `- Success rate: ${successRate.toFixed(2)}%\n`
  report += `- Inngest connectivity: ${inngestResult.success ? '✅ Available' : '❌ Unavailable'}\n\n`

  // Детальные результаты по каждому эндпоинту
  report += `## API Endpoints Details\n\n`

  for (const result of apiResults) {
    const {
      endpoint,
      success,
      statusCode,
      responseTime,
      error,
      validationResult,
    } = result

    // Информация о эндпоинте
    report += `### ${endpoint.name} (${endpoint.method} ${endpoint.path})\n\n`
    report += `- Status: ${success ? '✅ SUCCESS' : '❌ FAILED'}\n`
    report += `- Description: ${endpoint.description}\n`

    // Добавляем детали результата
    if (statusCode) {
      report += `- Status code: ${statusCode}\n`
    }

    if (responseTime) {
      report += `- Response time: ${responseTime}ms\n`
    }

    if (error) {
      report += `- Error: ${error}\n`
    }

    if (validationResult) {
      report += `- Validation: ${validationResult.success ? 'Passed' : 'Failed'}\n`
      if (validationResult.message) {
        report += `- Validation message: ${validationResult.message}\n`
      }
    }

    report += '\n'
  }

  // Информация о подключении к Inngest
  report += `## Inngest Connectivity\n\n`
  report += `- Status: ${inngestResult.success ? '✅ SUCCESS' : '❌ FAILED'}\n`
  report += `- Message: ${inngestResult.message}\n`

  if (inngestResult.responseTime) {
    report += `- Response time: ${inngestResult.responseTime}ms\n`
  }

  if (inngestResult.error) {
    report += `- Error: ${inngestResult.error}\n`
  }

  return report
}

/**
 * Запускает полный тест API
 */
export async function runApiFullTest(
  options: { generateReport?: boolean } = {}
): Promise<TestResult> {
  try {
    logger.info({
      message: '🚀 Запуск полного теста API',
      description: 'Starting full API test',
      category: TestCategory.Api,
    })

    // Тестируем все API эндпоинты
    const apiResults = await Promise.all(
      API_ENDPOINTS.filter(endpoint => !endpoint.disabled).map(testEndpoint)
    )

    // Тестируем подключение к Inngest
    const inngestResult = await testInngestConnectivity()

    // Вычисляем общий результат
    const totalEndpoints = apiResults.length
    const successfulEndpoints = apiResults.filter(r => r.success).length
    const failedEndpoints = totalEndpoints - successfulEndpoints
    const successRate = (successfulEndpoints / totalEndpoints) * 100

    // Тест успешен, если не менее 80% эндпоинтов доступны и Inngest API доступен
    const success = successRate >= 80 && inngestResult.success

    // Создаем отчет, если требуется
    let report: string | undefined
    if (options.generateReport) {
      report = generateTestReport(apiResults, inngestResult)
    }

    // Формируем итоговое сообщение
    const message = `API Test: ${successfulEndpoints}/${totalEndpoints} endpoints available (${successRate.toFixed(2)}%), Inngest ${inngestResult.success ? 'available' : 'unavailable'}`

    // Выводим результат
    if (success) {
      logger.info({
        message: `✅ ${message}`,
        description: 'Full API test completed successfully',
        successRate: `${successRate.toFixed(2)}%`,
        inngestAvailable: inngestResult.success,
      })
    } else {
      logger.warn({
        message: `⚠️ ${message}`,
        description: 'Full API test completed with issues',
        successRate: `${successRate.toFixed(2)}%`,
        inngestAvailable: inngestResult.success,
      })
    }

    // Возвращаем результат
    return {
      success,
      name: 'API Full Test',
      message,
      category: TestCategory.Api,
      details: {
        totalEndpoints,
        successfulEndpoints,
        failedEndpoints,
        successRate,
        inngestAvailable: inngestResult.success,
        apiResults,
        inngestResult,
        report,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: `❌ Ошибка при выполнении полного теста API: ${errorMessage}`,
      description: 'Error during full API test',
      error: errorMessage,
    })

    return {
      success: false,
      name: 'API Full Test',
      message: `Ошибка при выполнении полного теста API: ${errorMessage}`,
      category: TestCategory.Api,
      error: errorMessage,
    }
  }
}

// Если файл запущен напрямую, запускаем тест
if (require.main === module) {
  runApiFullTest({ generateReport: true })
    .then(result => {
      console.log('\n--- API Test Results ---\n')
      console.log(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`)
      console.log(`Message: ${result.message}`)

      if (result.details?.report) {
        console.log('\n--- Test Report ---\n')
        console.log(result.details.report)
      }

      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('Error running API test:', error)
      process.exit(1)
    })
}
