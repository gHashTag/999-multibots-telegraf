import axios from 'axios'
import { logger } from '@/utils/logger'
import { TestResult } from '../../types'
import { TestCategory } from '../../core/categories'
import { TEST_CONFIG } from '../../test-config'

// Типы с добавлением поля report для отчета
type ApiTestResult = TestResult & {
  report?: string
}

// Базовый URL для API-запросов
const BASE_API_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const API_URL = process.env.API_URL || BASE_API_URL

// Внешние API URL
const EXTERNAL_API = {
  bfl: 'https://api.us1.bfl.ai/v1',
}

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
}

/**
 * Список внутренних API эндпоинтов для тестирования
 */
const API_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'Основной API',
    path: `${API_URL}/api`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Основной API сервера',
  },
  {
    name: 'Inngest API',
    path: `${API_URL}/api/inngest`,
    method: 'GET',
    expectedStatus: 200,
    description: 'API Inngest для обработки событий',
  },
  {
    name: 'Inngest Dev Tools',
    path: `${API_URL}/api/inngest/dev`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Инструменты разработчика Inngest',
  },
  {
    name: 'Uploads',
    path: `${API_URL}/uploads`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Доступ к загруженным файлам',
  },
  {
    name: 'Webhook нейрофото',
    path: `${API_URL}/webhooks/neurophoto`,
    method: 'POST',
    expectedStatus: 500, // Без данных ожидаем ошибку
    description: 'Webhook для обработки результатов нейрофото',
  },
  {
    name: 'Webhook BFL',
    path: `${API_URL}/webhooks/bfl`,
    method: 'POST',
    expectedStatus: 500, // Без данных ожидаем ошибку
    description: 'Webhook для обработки результатов BFL API',
  },
  {
    name: 'Webhook Replicate',
    path: `${API_URL}/webhooks/replicate`,
    method: 'POST',
    expectedStatus: 500, // Без данных ожидаем ошибку
    description: 'Webhook для обработки результатов Replicate',
  },
]

/**
 * Список внешних API эндпоинтов
 */
const EXTERNAL_API_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'BFL API - Flux Pro',
    path: `${EXTERNAL_API.bfl}/flux-pro-1.1-ultra`,
    method: 'GET',
    expectedStatus: 401, // Без ключа API ожидаем 401 Unauthorized
    description: 'API для генерации изображений Flux Pro',
    disabled: !process.env.BFL_API_KEY, // Отключаем если нет ключа API
  },
  {
    name: 'BFL API - Flux Pro Finetuned',
    path: `${EXTERNAL_API.bfl}/flux-pro-1.1-ultra-finetuned`,
    method: 'GET',
    expectedStatus: 401, // Без ключа API ожидаем 401 Unauthorized
    description: 'API для генерации изображений с fine-tuning',
    disabled: !process.env.BFL_API_KEY, // Отключаем если нет ключа API
  },
  {
    name: 'BFL API с ключом',
    path: `${EXTERNAL_API.bfl}/flux-pro-1.1-ultra`,
    method: 'GET',
    expectedStatus: 400, // С ключом API ожидаем 400 Bad Request (нет тела запроса)
    description: 'Проверка доступа к API с ключом',
    headers: { 'X-Key': process.env.BFL_API_KEY || '' },
    disabled: !process.env.BFL_API_KEY, // Отключаем если нет ключа API
  },
]

/**
 * Тестирует один API эндпоинт
 */
async function testEndpoint(
  endpoint: ApiEndpoint,
  baseUrl: string = ''
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  try {
    // Если эндпоинт отключен, пропускаем его
    if (endpoint.disabled) {
      logger.info({
        message: `⏩ Пропуск отключенного эндпоинта: ${endpoint.name}`,
        description: `Skipping disabled endpoint: ${endpoint.name}`,
      })
      return { success: true }
    }

    // Формируем URL в зависимости от того, относительный или абсолютный путь
    const url = endpoint.path.startsWith('http')
      ? endpoint.path
      : `${baseUrl}${endpoint.path}`

    logger.info({
      message: `🔍 Тестирование эндпоинта: ${endpoint.name} (${url})`,
      description: `Testing endpoint: ${endpoint.name} (${url})`,
    })

    const response = await axios({
      method: endpoint.method,
      url,
      timeout: TEST_CONFIG.TIMEOUTS.MEDIUM,
      headers: endpoint.headers,
      data: endpoint.data,
      validateStatus: () => true, // Чтобы axios не выбрасывал исключения при статусах, отличных от 2xx
    })

    const statusCode = response.status
    const success = statusCode === endpoint.expectedStatus

    if (success) {
      logger.info({
        message: `✅ Эндпоинт ${endpoint.name} доступен (${statusCode})`,
        description: `Endpoint ${endpoint.name} is available (${statusCode})`,
      })
      return { success: true, statusCode }
    } else {
      logger.error({
        message: `❌ Эндпоинт ${endpoint.name} вернул неожиданный статус: ${statusCode}, ожидался: ${endpoint.expectedStatus}`,
        description: `Endpoint ${endpoint.name} returned unexpected status: ${statusCode}, expected: ${endpoint.expectedStatus}`,
      })
      return {
        success: false,
        error: `Неверный статус: ${statusCode}, ожидался: ${endpoint.expectedStatus}`,
        statusCode,
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Ошибка при тестировании эндпоинта ${endpoint.name}: ${errorMessage}`,
      description: `Error testing endpoint ${endpoint.name}: ${errorMessage}`,
    })
    return { success: false, error: errorMessage }
  }
}

/**
 * Тестирует все внутренние API эндпоинты
 */
async function testInternalApis(): Promise<{
  success: boolean
  results: {
    endpoint: ApiEndpoint
    success: boolean
    error?: string
    statusCode?: number
  }[]
  error?: string
}> {
  logger.info({
    message: '🔍 Проверка внутренних API эндпоинтов',
    description: 'Testing internal API endpoints',
  })

  const results = []
  let allSuccess = true

  for (const endpoint of API_ENDPOINTS) {
    const result = await testEndpoint(endpoint)
    results.push({
      endpoint,
      success: result.success,
      error: result.error,
      statusCode: result.statusCode,
    })

    if (!result.success) {
      allSuccess = false
    }
  }

  if (allSuccess) {
    logger.info({
      message: '✅ Все внутренние API эндпоинты доступны',
      description: 'All internal API endpoints are available',
    })
    return { success: true, results }
  } else {
    const errors = results
      .filter(r => !r.success)
      .map(r => `${r.endpoint.name}: ${r.error}`)
      .join('; ')

    logger.error({
      message: `❌ Некоторые внутренние API эндпоинты недоступны: ${errors}`,
      description: `Some internal API endpoints are unavailable: ${errors}`,
    })
    return {
      success: false,
      results,
      error: `Недоступные внутренние API: ${errors}`,
    }
  }
}

/**
 * Проверяет доступность внешних API для НейроФото V2
 */
async function testExternalApis(): Promise<{
  success: boolean
  results: {
    endpoint: ApiEndpoint
    success: boolean
    error?: string
    statusCode?: number
  }[]
  error?: string
}> {
  logger.info({
    message: '🔍 Проверка доступности внешних API для НейроФото V2',
    description: 'Testing external APIs for NeuroPhoto V2',
  })

  const results = []
  let allSuccess = true

  for (const endpoint of EXTERNAL_API_ENDPOINTS) {
    if (endpoint.disabled) {
      logger.info({
        message: `⏩ Пропуск отключенного эндпоинта: ${endpoint.name}`,
        description: `Skipping disabled endpoint: ${endpoint.name}`,
      })
      continue
    }

    const result = await testEndpoint(endpoint)
    results.push({
      endpoint,
      success: result.success,
      error: result.error,
      statusCode: result.statusCode,
    })

    if (!result.success) {
      allSuccess = false
    }
  }

  if (allSuccess) {
    logger.info({
      message: '✅ Все внешние API доступны',
      description: 'All external APIs are available',
    })
    return { success: true, results }
  } else {
    const errors = results
      .filter(r => !r.success)
      .map(r => `${r.endpoint.name}: ${r.error}`)
      .join('; ')

    logger.error({
      message: `❌ Некоторые внешние API недоступны: ${errors}`,
      description: `Some external APIs are unavailable: ${errors}`,
    })
    return {
      success: false,
      results,
      error: `Недоступные внешние API: ${errors}`,
    }
  }
}

/**
 * Тестирует работоспособность webhook для нейрофото
 */
async function testNeuroPhotoWebhook(): Promise<{
  success: boolean
  message: string
  error?: string
}> {
  logger.info({
    message: '🔍 Тестирование webhook нейрофото с тестовыми данными',
    description: 'Testing neurophoto webhook with test data',
  })

  try {
    // Создаем тестовые данные для webhook
    const testData = {
      task_id: `test-${Date.now()}`,
      status: 'COMPLETED',
      result: {
        sample: 'https://example.com/test-image.jpg',
      },
    }

    // Отправляем запрос на webhook
    const response = await axios({
      method: 'POST',
      url: `${API_URL}/webhooks/neurophoto-debug`,
      timeout: TEST_CONFIG.TIMEOUTS.MEDIUM,
      data: testData,
      validateStatus: () => true,
    })

    if (response.status === 200) {
      logger.info({
        message: '✅ Тестовый webhook нейрофото успешно обработан',
        description: 'Test neurophoto webhook processed successfully',
        status: response.status,
      })
      return {
        success: true,
        message: 'Webhook нейрофото работает корректно',
      }
    } else {
      logger.error({
        message: `❌ Ошибка при тестировании webhook нейрофото: неверный статус ${response.status}`,
        description: `Error testing neurophoto webhook: invalid status ${response.status}`,
      })
      return {
        success: false,
        message: 'Webhook нейрофото вернул ошибку',
        error: `Неверный статус: ${response.status}`,
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Ошибка при тестировании webhook нейрофото: ${errorMessage}`,
      description: `Error testing neurophoto webhook: ${errorMessage}`,
    })
    return {
      success: false,
      message: 'Ошибка при тестировании webhook нейрофото',
      error: errorMessage,
    }
  }
}

/**
 * Генерирует отчет о тестировании API
 */
function generateApiTestReport(
  internalResults: {
    endpoint: ApiEndpoint
    success: boolean
    error?: string
    statusCode?: number
  }[],
  externalResults: {
    endpoint: ApiEndpoint
    success: boolean
    error?: string
    statusCode?: number
  }[],
  webhookResult: { success: boolean; message: string; error?: string }
): string {
  const internalSuccess = internalResults.filter(r => r.success).length
  const internalTotal = internalResults.length
  const externalSuccess = externalResults.filter(r => r.success).length
  const externalTotal = externalResults.length

  let report = '📊 Отчет о тестировании API\n\n'
  report += `📡 Внутренние API: ${internalSuccess}/${internalTotal} успешно\n`
  report += `🌐 Внешние API: ${externalSuccess}/${externalTotal} успешно\n`
  report += `🔄 Webhook нейрофото: ${webhookResult.success ? '✅ Работает' : '❌ Ошибка'}\n\n`

  if (internalTotal - internalSuccess > 0) {
    report += '❌ Проблемные внутренние API:\n'
    internalResults
      .filter(r => !r.success)
      .forEach(r => {
        report += `- ${r.endpoint.name}: ${r.error}\n`
      })
    report += '\n'
  }

  if (externalTotal - externalSuccess > 0) {
    report += '❌ Проблемные внешние API:\n'
    externalResults
      .filter(r => !r.success)
      .forEach(r => {
        report += `- ${r.endpoint.name}: ${r.error}\n`
      })
    report += '\n'
  }

  if (!webhookResult.success) {
    report += `❌ Проблема с webhook нейрофото: ${webhookResult.error}\n\n`
  }

  report += '✅ Рекомендации:\n'
  if (
    internalTotal - internalSuccess > 0 ||
    externalTotal - externalSuccess > 0 ||
    !webhookResult.success
  ) {
    report += '- Проверьте логи сервера для более подробной информации\n'
    report += '- Перезапустите сервисы, если они недоступны\n'
    report += '- Проверьте конфигурацию NGINX и Docker\n'
    report +=
      '- Убедитесь, что все переменные окружения установлены корректно\n'
  } else {
    report += '- Все API работают корректно\n'
  }

  return report
}

/**
 * Запускает тестирование API
 */
export async function runApiTests(
  options: {
    generateReport?: boolean
  } = {}
): Promise<ApiTestResult> {
  const { generateReport = false } = options

  logger.info({
    message: '🚀 Запуск тестирования API',
    description: 'Starting API tests',
  })

  try {
    // Тестируем внутренние API
    const internalApiResults = await testInternalApis()

    // Тестируем внешние API
    const externalApiResults = await testExternalApis()

    // Тестируем webhook нейрофото
    const webhookResult = await testNeuroPhotoWebhook()

    // Определяем общий результат
    const success =
      internalApiResults.success &&
      externalApiResults.success &&
      webhookResult.success

    // Формируем детали
    const details = {
      internalApi: internalApiResults,
      externalApi: externalApiResults,
      webhook: webhookResult,
    }

    // Генерируем отчет, если требуется
    let report: string | undefined
    if (generateReport) {
      report = generateApiTestReport(
        internalApiResults.results,
        externalApiResults.results,
        webhookResult
      )
      logger.info({
        message: '📊 Отчет о тестировании API сгенерирован',
        description: 'API test report generated',
        report,
      })
    }

    // Логируем итоговый результат
    if (success) {
      logger.info({
        message: '✅ Все тесты API прошли успешно',
        description: 'All API tests passed successfully',
      })
    } else {
      logger.error({
        message: '❌ Некоторые тесты API не прошли',
        description: 'Some API tests failed',
        internalApiSuccess: internalApiResults.success,
        externalApiSuccess: externalApiResults.success,
        webhookSuccess: webhookResult.success,
      })
    }

    return {
      success,
      name: 'Тестирование API',
      message: success
        ? 'Все тесты API прошли успешно'
        : 'Некоторые тесты API не прошли',
      category: TestCategory.Api,
      details,
      report,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Критическая ошибка при тестировании API: ${errorMessage}`,
      description: `Critical error during API testing: ${errorMessage}`,
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      name: 'Тестирование API',
      message: 'Критическая ошибка при тестировании API',
      category: TestCategory.Api,
      error: errorMessage,
    }
  }
}

/**
 * Запускает тестирование API как отдельный скрипт
 */
async function main() {
  try {
    const result = await runApiTests({ generateReport: true })

    console.log(result.report)

    if (!result.success) {
      process.exit(1)
    }

    process.exit(0)
  } catch (error) {
    console.error('Критическая ошибка при выполнении тестов API:', error)
    process.exit(1)
  }
}

// Если файл запущен напрямую, запускаем тесты
if (require.main === module) {
  main()
}
