import axios from 'axios'
import { logger } from '../../../utils/logger'
import { TestResult } from '../../types'
import { TEST_CONFIG } from '../../test-config'
import fs from 'fs'
import path from 'path'

// Расширяем тип результата теста
interface ApiMonitoringResult extends TestResult {
  report?: string
  statusHistory?: Record<string, ApiEndpointHistory[]>
}

// Тип для хранения истории статусов API
interface ApiEndpointHistory {
  timestamp: number
  name: string
  path: string
  status: 'up' | 'down'
  responseTime: number
  statusCode?: number
  error?: string
}

// Базовый URL API
const API_URL = process.env.API_URL || 'http://localhost:2999'

// Внешние API
const EXTERNAL_API = {
  NEURAL_PHOTO: process.env.NEURAL_PHOTO_API_URL || 'https://api.neural.love',
  STABLE_DIFFUSION:
    process.env.STABLE_DIFFUSION_API_URL || 'https://api.stability.ai',
}

// Интерфейс для описания эндпоинта API
interface ApiEndpoint {
  name: string
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  expectedStatus: number
  description: string
  headers?: Record<string, string>
  data?: any
  disabled?: boolean
}

// Список внутренних API эндпоинтов для мониторинга
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
    name: 'Webhook API (DEBUG)',
    path: `${API_URL}/webhooks/ping`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности webhook API',
  },
  {
    name: 'Webhook НейроФото',
    path: `${API_URL}/webhooks/neurophoto-debug`,
    method: 'POST',
    expectedStatus: 200,
    description: 'Проверка доступности webhook для НейроФото',
    data: {
      task_id: `test-${Date.now()}`,
      status: 'COMPLETED',
      result: { sample: 'https://example.com/test-image.jpg' },
    },
  },
  {
    name: 'Бот #1',
    path: `${API_URL}/bot1/webhook`,
    method: 'POST',
    expectedStatus: 200,
    description: 'Проверка доступности webhook для Бота #1',
    data: { update_id: 123, message: { text: '/ping' } },
  },
  {
    name: 'Бот #2',
    path: `${API_URL}/bot2/webhook`,
    method: 'POST',
    expectedStatus: 200,
    description: 'Проверка доступности webhook для Бота #2',
    data: { update_id: 123, message: { text: '/ping' } },
  },
  // Можно добавить другие внутренние API
]

// Список внешних API эндпоинтов для мониторинга
const EXTERNAL_API_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'Neural Photo API',
    path: `${EXTERNAL_API.NEURAL_PHOTO}/health`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности API Neural Photo',
    disabled: !process.env.NEURAL_PHOTO_API_KEY,
  },
  {
    name: 'Stable Diffusion API',
    path: `${EXTERNAL_API.STABLE_DIFFUSION}/v1/engines/list`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Проверка доступности API Stable Diffusion',
    headers: {
      Authorization: `Bearer ${process.env.STABILITY_API_KEY || ''}`,
    },
    disabled: !process.env.STABILITY_API_KEY,
  },
  // Можно добавить другие внешние API
]

// Путь к файлу истории статусов
const HISTORY_FILE_PATH = path.join(
  __dirname,
  '../../../logs/api-status-history.json'
)

/**
 * Загружает историю статусов API
 */
function loadStatusHistory(): Record<string, ApiEndpointHistory[]> {
  try {
    if (fs.existsSync(HISTORY_FILE_PATH)) {
      const data = fs.readFileSync(HISTORY_FILE_PATH, 'utf8')
      return JSON.parse(data)
    }
  } catch (error) {
    logger.error({
      message: `❌ Ошибка при загрузке истории статусов API: ${error instanceof Error ? error.message : String(error)}`,
      description: `Error loading API status history: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
  return {}
}

/**
 * Сохраняет историю статусов API
 */
function saveStatusHistory(
  history: Record<string, ApiEndpointHistory[]>
): void {
  try {
    // Создаем директорию logs, если она не существует
    const dir = path.dirname(HISTORY_FILE_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(
      HISTORY_FILE_PATH,
      JSON.stringify(history, null, 2),
      'utf8'
    )
    logger.info({
      message: '💾 История статусов API успешно сохранена',
      description: 'API status history saved successfully',
    })
  } catch (error) {
    logger.error({
      message: `❌ Ошибка при сохранении истории статусов API: ${error instanceof Error ? error.message : String(error)}`,
      description: `Error saving API status history: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

/**
 * Тестирует один API эндпоинт
 */
async function testEndpoint(endpoint: ApiEndpoint): Promise<{
  success: boolean
  error?: string
  statusCode?: number
  responseTime: number
}> {
  const startTime = Date.now()

  try {
    logger.info({
      message: `🔍 Проверка эндпоинта: ${endpoint.name} (${endpoint.path})`,
      description: `Testing endpoint: ${endpoint.name} (${endpoint.path})`,
    })

    const response = await axios({
      method: endpoint.method,
      url: endpoint.path,
      timeout: TEST_CONFIG.TIMEOUTS.MEDIUM,
      headers: endpoint.headers,
      data: endpoint.data,
      validateStatus: () => true, // Не выбрасывать ошибку для любого статуса ответа
    })

    const responseTime = Date.now() - startTime

    if (response.status === endpoint.expectedStatus) {
      logger.info({
        message: `✅ Эндпоинт ${endpoint.name} доступен (${response.status}, ${responseTime}ms)`,
        description: `Endpoint ${endpoint.name} is available (${response.status}, ${responseTime}ms)`,
      })
      return {
        success: true,
        statusCode: response.status,
        responseTime,
      }
    } else {
      logger.warn({
        message: `⚠️ Эндпоинт ${endpoint.name} вернул неожиданный статус: ${response.status} (ожидался ${endpoint.expectedStatus})`,
        description: `Endpoint ${endpoint.name} returned unexpected status: ${response.status} (expected ${endpoint.expectedStatus})`,
        responseTime,
      })
      return {
        success: false,
        error: `Неожиданный статус: ${response.status}`,
        statusCode: response.status,
        responseTime,
      }
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      message: `❌ Ошибка при проверке эндпоинта ${endpoint.name}: ${errorMessage}`,
      description: `Error testing endpoint ${endpoint.name}: ${errorMessage}`,
      responseTime,
    })

    return {
      success: false,
      error: errorMessage,
      responseTime,
    }
  }
}

/**
 * Обновляет историю статусов для эндпоинта
 */
function updateEndpointHistory(
  history: Record<string, ApiEndpointHistory[]>,
  endpoint: ApiEndpoint,
  result: {
    success: boolean
    error?: string
    statusCode?: number
    responseTime: number
  }
): void {
  const key = `${endpoint.method}:${endpoint.path}`

  if (!history[key]) {
    history[key] = []
  }

  // Ограничиваем историю до 100 записей
  if (history[key].length >= 100) {
    history[key] = history[key].slice(-99)
  }

  history[key].push({
    timestamp: Date.now(),
    name: endpoint.name,
    path: endpoint.path,
    status: result.success ? 'up' : 'down',
    responseTime: result.responseTime,
    statusCode: result.statusCode,
    error: result.error,
  })
}

/**
 * Генерирует отчет о мониторинге API
 */
function generateMonitoringReport(
  internalResults: {
    endpoint: ApiEndpoint
    success: boolean
    error?: string
    statusCode?: number
    responseTime: number
  }[],
  externalResults: {
    endpoint: ApiEndpoint
    success: boolean
    error?: string
    statusCode?: number
    responseTime: number
  }[],
  history: Record<string, ApiEndpointHistory[]>
): string {
  const internalSuccess = internalResults.filter(r => r.success).length
  const internalTotal = internalResults.length
  const externalSuccess = externalResults.filter(r => r.success).length
  const externalTotal = externalResults.length

  const timestamp = new Date().toISOString()

  let report = `📊 Отчет о мониторинге API (${timestamp})\n\n`
  report += `📡 Внутренние API: ${internalSuccess}/${internalTotal} доступны\n`
  report += `🌐 Внешние API: ${externalSuccess}/${externalTotal} доступны\n\n`

  report += '📈 Время отклика (внутренние API):\n'
  internalResults.forEach(r => {
    const statusEmoji = r.success ? '✅' : '❌'
    report += `${statusEmoji} ${r.endpoint.name}: ${r.responseTime}ms ${r.success ? '' : `(${r.error || 'Ошибка'})`}\n`
  })

  report += '\n📈 Время отклика (внешние API):\n'
  externalResults.forEach(r => {
    if (!r.endpoint.disabled) {
      const statusEmoji = r.success ? '✅' : '❌'
      report += `${statusEmoji} ${r.endpoint.name}: ${r.responseTime}ms ${r.success ? '' : `(${r.error || 'Ошибка'})`}\n`
    } else {
      report += `⏩ ${r.endpoint.name}: отключен (нет API ключа)\n`
    }
  })

  report += '\n🔍 Анализ проблем:\n'
  const problemEndpoints = [...internalResults, ...externalResults].filter(
    r => !r.success && !r.endpoint.disabled
  )

  if (problemEndpoints.length > 0) {
    problemEndpoints.forEach(r => {
      report += `❌ ${r.endpoint.name}: ${r.error || 'Недоступен'}\n`

      // Анализ истории для этого эндпоинта
      const key = `${r.endpoint.method}:${r.endpoint.path}`
      const endpointHistory = history[key] || []
      const last5 = endpointHistory.slice(-5)

      if (last5.length > 0) {
        const downCount = last5.filter(h => h.status === 'down').length
        if (downCount === last5.length) {
          report += `   ⚠️ Недоступен последние ${downCount} проверок\n`
        } else {
          report += `   ℹ️ Недоступен ${downCount} из последних ${last5.length} проверок\n`
        }
      }
    })
  } else {
    report += '✅ Все активные API доступны\n'
  }

  return report
}

/**
 * Запускает мониторинг API
 */
export async function runApiMonitoring(
  options: {
    generateReport?: boolean
  } = {}
): Promise<ApiMonitoringResult> {
  const { generateReport = true } = options

  logger.info({
    message: '🚀 Запуск мониторинга API',
    description: 'Starting API monitoring',
  })

  try {
    // Загружаем историю статусов
    const statusHistory = loadStatusHistory()

    // Результаты проверки внутренних API
    const internalResults = []
    for (const endpoint of API_ENDPOINTS) {
      const result = await testEndpoint(endpoint)
      internalResults.push({
        endpoint,
        ...result,
      })

      // Обновляем историю статусов
      updateEndpointHistory(statusHistory, endpoint, result)
    }

    // Результаты проверки внешних API
    const externalResults = []
    for (const endpoint of EXTERNAL_API_ENDPOINTS) {
      if (endpoint.disabled) {
        logger.info({
          message: `⏩ Пропуск отключенного эндпоинта: ${endpoint.name}`,
          description: `Skipping disabled endpoint: ${endpoint.name}`,
        })
        externalResults.push({
          endpoint,
          success: false,
          error: 'API ключ не установлен',
          responseTime: 0,
        })
        continue
      }

      const result = await testEndpoint(endpoint)
      externalResults.push({
        endpoint,
        ...result,
      })

      // Обновляем историю статусов
      updateEndpointHistory(statusHistory, endpoint, result)
    }

    // Сохраняем обновленную историю
    saveStatusHistory(statusHistory)

    // Определяем общий результат
    const internalSuccess = internalResults.every(r => r.success)
    const externalSuccessCount = externalResults.filter(
      r => r.success || r.endpoint.disabled
    ).length
    const externalTotal = externalResults.filter(
      r => !r.endpoint.disabled
    ).length
    const externalSuccess = externalSuccessCount === externalTotal

    const success = internalSuccess && externalSuccess

    // Генерируем отчет, если требуется
    let report: string | undefined
    if (generateReport) {
      report = generateMonitoringReport(
        internalResults,
        externalResults,
        statusHistory
      )
      logger.info({
        message: '📊 Отчет о мониторинге API сгенерирован',
        description: 'API monitoring report generated',
      })
    }

    // Логируем итоговый результат
    if (success) {
      logger.info({
        message: '✅ Все API доступны и работают корректно',
        description: 'All APIs are available and working correctly',
      })
    } else {
      logger.warn({
        message: '⚠️ Некоторые API недоступны или работают некорректно',
        description: 'Some APIs are unavailable or not working correctly',
        internalApiSuccess: internalSuccess,
        externalApiSuccess: externalSuccess,
      })
    }

    return {
      success,
      name: 'Мониторинг API',
      message: success
        ? 'Все API доступны и работают корректно'
        : 'Некоторые API недоступны или работают некорректно',
      category: 'Api',
      report,
      statusHistory,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({
      message: `❌ Критическая ошибка при мониторинге API: ${errorMessage}`,
      description: `Critical error during API monitoring: ${errorMessage}`,
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      name: 'Мониторинг API',
      message: 'Критическая ошибка при мониторинге API',
      category: 'Api',
      error: errorMessage,
    }
  }
}

/**
 * Запускает мониторинг API как отдельный скрипт
 */
async function main() {
  try {
    const result = await runApiMonitoring({ generateReport: true })

    if (result.report) {
      console.log(result.report)
    }

    process.exit(result.success ? 0 : 1)
  } catch (error) {
    console.error('Критическая ошибка при выполнении мониторинга API:', error)
    process.exit(1)
  }
}

// Если файл запущен напрямую, запускаем мониторинг
if (require.main === module) {
  main()
}
