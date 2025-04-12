/**
 * API Health Test - Тест доступности API эндпоинтов
 *
 * Этот тест проверяет доступность и функциональность различных API эндпоинтов,
 * включая основной API, Inngest API, вебхуки и эндпоинты ботов.
 */

import axios from 'axios'
import { logger } from '@/utils/logger'
import { TestResult } from '../types'
import { TestCategory } from '../core/categories'

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
    name: 'Генерация контента',
    path: '/api/generate',
    method: 'POST',
    expectedStatus: 200,
    description: 'API для генерации контента',
    data: {
      type: 'test',
      prompt: 'Test prompt',
      telegramId: '123456789',
    },
    headers: {
      'Content-Type': 'application/json',
    },
  },
  {
    name: 'Inngest API',
    path: '/api/inngest',
    method: 'GET',
    expectedStatus: 200,
    description: 'Эндпоинт для Inngest функций',
  },
  {
    name: 'Webhook',
    path: '/api/webhook',
    method: 'POST',
    expectedStatus: 200,
    description: 'Эндпоинт для вебхуков',
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
    name: 'Webhook нейрофото',
    path: '/webhooks/neurophoto',
    method: 'POST',
    expectedStatus: 400, // Без правильных данных должен вернуть ошибку
    description: 'Вебхук для нейрофото',
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
    name: 'Webhook Replicate',
    path: '/webhooks/replicate',
    method: 'POST',
    expectedStatus: 400, // Без правильных данных должен вернуть ошибку
    description: 'Вебхук для Replicate',
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
    name: 'Бот Telegram',
    path: '/bot',
    method: 'POST',
    expectedStatus: 200,
    description: 'Эндпоинт для Telegram бота',
    disabled: true, // Требует правильных Telegram Update данных
  },
]

/**
 * Тестирует один эндпоинт
 *
 * @param endpoint - Описание эндпоинта для тестирования
 * @returns Promise<TestResult> - Результат теста
 */
async function testEndpoint(endpoint: ApiEndpoint): Promise<TestResult> {
  const url = `${BASE_API_URL}${endpoint.path}`

  // Если эндпоинт отключен, пропускаем тест
  if (endpoint.disabled) {
    logger.info(
      `🔘 [API_TEST]: Эндпоинт ${endpoint.name} отключен для проверки`
    )
    return {
      success: true,
      message: `Эндпоинт ${endpoint.name} отключен для проверки`,
      name: `API Test: ${endpoint.name}`,
      category: TestCategory.Api,
    }
  }

  logger.info(
    `🚀 [API_TEST]: Проверка эндпоинта ${endpoint.name} (${endpoint.method} ${url})`
  )

  try {
    const response = await axios({
      method: endpoint.method.toLowerCase(),
      url,
      headers: endpoint.headers,
      data: endpoint.method !== 'GET' ? endpoint.data : undefined,
      validateStatus: () => true, // Не выбрасывать исключения для HTTP ошибок
      timeout: 5000, // Таймаут 5 секунд
    })

    // Проверка статуса ответа
    const statusMatch = response.status === endpoint.expectedStatus

    if (!statusMatch) {
      logger.error(
        `❌ [API_TEST]: Эндпоинт ${endpoint.name} вернул неожиданный статус ${response.status} (ожидался ${endpoint.expectedStatus})`
      )
      return {
        success: false,
        message: `Эндпоинт ${endpoint.name} вернул статус ${response.status}, ожидался ${endpoint.expectedStatus}`,
        name: `API Test: ${endpoint.name}`,
        category: TestCategory.Api,
        error: new Error(`Неожиданный статус ${response.status}`),
      }
    }

    // Если есть функция валидации, используем ее
    if (endpoint.validate) {
      const validationResult = endpoint.validate(response)
      if (!validationResult.success) {
        logger.error(
          `❌ [API_TEST]: Эндпоинт ${endpoint.name} не прошел валидацию: ${validationResult.message}`
        )
        return {
          success: false,
          message: `Эндпоинт ${endpoint.name} не прошел валидацию: ${validationResult.message}`,
          name: `API Test: ${endpoint.name}`,
          category: TestCategory.Api,
          error: new Error(validationResult.message),
        }
      }
    }

    logger.info(
      `✅ [API_TEST]: Эндпоинт ${endpoint.name} доступен (статус ${response.status})`
    )
    return {
      success: true,
      message: `Эндпоинт ${endpoint.name} доступен (статус ${response.status})`,
      name: `API Test: ${endpoint.name}`,
      category: TestCategory.Api,
    }
  } catch (error) {
    logger.error(
      `❌ [API_TEST]: Ошибка при проверке эндпоинта ${endpoint.name}:`,
      error
    )
    return {
      success: false,
      message: `Ошибка при проверке эндпоинта ${endpoint.name}: ${error.message}`,
      name: `API Test: ${endpoint.name}`,
      category: TestCategory.Api,
      error,
    }
  }
}

/**
 * Тестирует доступность Inngest API
 *
 * @returns Promise<TestResult> - Результат теста
 */
async function testInngestAvailability(): Promise<TestResult> {
  const inngestUrl = process.env.INNGEST_DEV_URL || 'http://localhost:8288/dev'

  logger.info(`🚀 [API_TEST]: Проверка доступности Inngest API (${inngestUrl})`)

  try {
    const response = await axios({
      method: 'GET',
      url: inngestUrl,
      validateStatus: () => true,
      timeout: 5000,
    })

    // Для Inngest обычно 200 или 302 статус
    const validStatus = response.status === 200 || response.status === 302

    if (!validStatus) {
      logger.error(
        `❌ [API_TEST]: Inngest API недоступен (статус ${response.status})`
      )
      return {
        success: false,
        message: `Inngest API недоступен (статус ${response.status})`,
        name: 'API Test: Inngest Availability',
        category: TestCategory.Api,
        error: new Error(`Неожиданный статус ${response.status}`),
      }
    }

    logger.info(
      `✅ [API_TEST]: Inngest API доступен (статус ${response.status})`
    )
    return {
      success: true,
      message: `Inngest API доступен (статус ${response.status})`,
      name: 'API Test: Inngest Availability',
      category: TestCategory.Api,
    }
  } catch (error) {
    logger.error(`❌ [API_TEST]: Ошибка при проверке Inngest API:`, error)
    return {
      success: false,
      message: `Ошибка при проверке Inngest API: ${error.message}`,
      name: 'API Test: Inngest Availability',
      category: TestCategory.Api,
      error,
    }
  }
}

/**
 * Генерирует отчет о результатах тестирования API
 *
 * @param results - Результаты тестов
 * @returns string - Текст отчета
 */
function generateApiTestReport(results: TestResult[]): string {
  const totalTests = results.length
  const passedTests = results.filter(r => r.success).length
  const failedTests = totalTests - passedTests

  let report = `\n📊 Отчет о тестировании API (${new Date().toLocaleString()})\n\n`
  report += `Всего проверено эндпоинтов: ${totalTests}\n`
  report += `✅ Успешно: ${passedTests}\n`
  report += `❌ Ошибок: ${failedTests}\n\n`

  if (failedTests > 0) {
    report += '🚨 Проблемные эндпоинты:\n'
    results
      .filter(r => !r.success)
      .forEach(result => {
        report += `- ${result.name}: ${result.message}\n`
      })
    report += '\n'
  }

  report += '📝 Детали проверки:\n'
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌'
    report += `${icon} ${result.name}: ${result.message}\n`
  })

  return report
}

/**
 * Запускает тесты API и возвращает результаты
 *
 * @param options - Опции запуска тестов
 * @returns Promise<TestResult[]> - Результаты тестов
 */
export async function runApiTests(
  options: {
    generateReport?: boolean // Генерировать отчет
    baseUrl?: string // Альтернативный базовый URL
  } = {}
): Promise<TestResult[]> {
  // Устанавливаем базовый URL если передан
  if (options.baseUrl) {
    process.env.API_URL = options.baseUrl
  }

  logger.info('🚀 [API_TEST]: Запуск тестирования API эндпоинтов')

  // Тестируем все эндпоинты
  const endpointResults = await Promise.all(
    API_ENDPOINTS.map(endpoint => testEndpoint(endpoint))
  )

  // Тестируем доступность Inngest
  const inngestResult = await testInngestAvailability()

  // Объединяем результаты
  const allResults = [...endpointResults, inngestResult]

  // Статистика
  const totalTests = allResults.length
  const passedTests = allResults.filter(r => r.success).length

  logger.info(`🏁 [API_TEST]: Тестирование API завершено`)
  logger.info(
    `📊 [API_TEST]: Всего проверено эндпоинтов: ${totalTests}, успешно: ${passedTests}, ошибок: ${totalTests - passedTests}`
  )

  // Генерируем отчет если нужно
  if (options.generateReport) {
    const report = generateApiTestReport(allResults)
    logger.info(report)
  }

  return allResults
}

/**
 * Запускает тест API и возвращает общий результат
 *
 * @returns Promise<TestResult> - Результат теста
 */
export async function runApiHealthTest(): Promise<TestResult> {
  try {
    const results = await runApiTests()
    const totalTests = results.length
    const passedTests = results.filter(r => r.success).length
    const failedTests = totalTests - passedTests

    // Если все тесты прошли успешно
    if (failedTests === 0) {
      return {
        success: true,
        message: `Все API эндпоинты (${totalTests}) доступны и работают корректно`,
        name: 'API Health Test',
        category: TestCategory.Api,
        details: { results },
      }
    }

    // Если есть ошибки
    return {
      success: false,
      message: `${failedTests} из ${totalTests} API эндпоинтов недоступны или возвращают ошибки`,
      name: 'API Health Test',
      category: TestCategory.Api,
      details: { results },
      error: new Error(`${failedTests} API эндпоинтов не работают`),
    }
  } catch (error) {
    return {
      success: false,
      message: `Ошибка при выполнении теста API: ${error.message}`,
      name: 'API Health Test',
      category: TestCategory.Api,
      error,
    }
  }
}

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
