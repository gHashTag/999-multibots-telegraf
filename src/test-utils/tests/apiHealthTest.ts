/**
 * API Health Test - Тест доступности API эндпоинтов
 *
 * Этот тест проверяет доступность ключевых API эндпоинтов в локальной и продакшн среде.
 *
 * Использование:
 *
 * 1. Тестирование обоих окружений (локальное и продакшн):
 *    ```
 *    ts-node -r tsconfig-paths/register src/test-utils/tests/apiHealthTest.ts
 *    ```
 *
 * 2. Тестирование только продакшн окружения:
 *    ```
 *    API_ENV=production ts-node -r tsconfig-paths/register src/test-utils/tests/apiHealthTest.ts
 *    ```
 *
 * 3. Тестирование только локального окружения:
 *    ```
 *    API_ENV=local ts-node -r tsconfig-paths/register src/test-utils/tests/apiHealthTest.ts
 *    ```
 *
 * 4. Тестирование произвольного URL (через код):
 *    ```
 *    runApiTests({
 *      generateReport: true,
 *      customUrl: 'https://your-custom-url.com'
 *    })
 *    ```
 *
 * Все тесты возвращают объект TestResult (или массив TestResult) с информацией
 * о доступности эндпоинтов и статусах ответов.
 */

import axios from 'axios'
import { TestResult } from '../types'
import { TestCategory } from '../core/categories'
import { logger } from '@/utils/logger'

/**
 * Базовые URL для API запросов
 */
const ENVIRONMENTS = {
  local: 'http://localhost:3000',
  production: 'https://999-multibots-u14194.vm.elestio.app',
}

const API = {
  base: process.env.API_BASE_URL || 'http://localhost:3000',
  inngest: process.env.INNGEST_BASE_URL || 'http://localhost:8288',
  inngestDev: process.env.INNGEST_DEV_URL || 'http://localhost:8288/dev',
  webhook: process.env.WEBHOOK_BASE_URL || 'http://localhost:3000/webhook',
}

// Определяем базовое окружение на основе переменной окружения или используем локальное по умолчанию
const BASE_URL = API.base

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
  /** Отключен ли эндпоинт для проверки (опционально) */
  disabled?: boolean
  /** Дополнительные данные (опционально) */
  data?: any
}

/**
 * Список эндпоинтов для тестирования
 */
const API_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'Main API',
    path: `${BASE_URL}/`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Main API endpoint',
  },
  {
    name: 'Content Generation API',
    path: `${BASE_URL}/api/generate`,
    method: 'POST',
    expectedStatus: 200,
    description: 'Content generation endpoint',
    headers: { 'Content-Type': 'application/json' },
    data: { prompt: 'Test prompt' },
  },
  {
    name: 'Inngest API',
    path: `${API.inngest}/api/events`,
    method: 'GET',
    expectedStatus: 200,
    description: 'Inngest API endpoint',
  },
  {
    name: 'Webhook API',
    path: '/api/webhook',
    method: 'GET',
    expectedStatus: 404,
    description: 'API для вебхуков',
  },
  {
    name: 'Бот Telegram API',
    path: '/bot',
    method: 'GET',
    expectedStatus: 403,
    description: 'API для Telegram бота',
  },
]

/**
 * Список внешних API эндпоинтов
 */
const EXTERNAL_API_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'BFL API - Flux Pro',
    path: 'https://api.getimg.ai/v1/text-to-image/flux-pro',
    method: 'GET',
    expectedStatus: 405, // Без API ключа ожидаем 405 Method Not Allowed (только POST)
    description: 'BFL API для генерации изображений Flux Pro',
  },
  {
    name: 'BFL API - Flux Pro Finetuned',
    path: 'https://api.getimg.ai/v1/text-to-image/flux-pro-finetuned',
    method: 'GET',
    expectedStatus: 405, // Без API ключа ожидаем 405 Method Not Allowed (только POST)
    description: 'BFL API для генерации изображений Flux Pro Finetuned',
  },
  {
    name: 'BFL API с ключом',
    path: 'https://api.getimg.ai/v1/text-to-image/flux-pro',
    method: 'GET',
    expectedStatus: 405, // API принимает только POST запросы
    description: 'BFL API для генерации изображений с ключом',
    headers: {
      Authorization: `Bearer ${process.env.BFL_API_KEY || ''}`,
    },
  },
]

/**
 * Тестирует один API эндпоинт
 */
async function testEndpoint(
  endpoint: ApiEndpoint,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Если эндпоинт отключен, пропускаем его
    if (endpoint.disabled) {
      logger.info(`⏩ Пропуск отключенного эндпоинта: ${endpoint.name}`)
      return { success: true }
    }

    // Формируем URL в зависимости от того, относительный или абсолютный путь
    const url = endpoint.path.startsWith('http')
      ? endpoint.path
      : `${baseUrl}${endpoint.path}`

    logger.info(`🔍 Тестирование эндпоинта: ${endpoint.name} (${url})`)

    const response = await axios({
      method: endpoint.method,
      url,
      timeout: 5000,
      headers: endpoint.headers,
      validateStatus: () => true, // Чтобы axios не выбрасывал исключения при статусах, отличных от 2xx
    })

    const success = response.status === endpoint.expectedStatus

    if (success) {
      logger.info(`✅ Эндпоинт ${endpoint.name} доступен (${response.status})`)
      return { success: true }
    } else {
      logger.error(
        `❌ Эндпоинт ${endpoint.name} вернул неожиданный статус: ${response.status}, ожидался: ${endpoint.expectedStatus}`
      )
      return {
        success: false,
        error: `Неверный статус: ${response.status}, ожидался: ${endpoint.expectedStatus}`,
      }
    }
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(
      `❌ Ошибка при тестировании эндпоинта ${endpoint.name}: ${errorMessage}`
    )
    return { success: false, error: errorMessage }
  }
}

/**
 * Проверяет доступность Inngest API
 */
async function testInngestAvailability(baseUrl: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const inngestUrl = `${baseUrl}/api/inngest`
    logger.info(`🔍 Проверка доступности Inngest API: ${inngestUrl}`)

    const response = await axios({
      method: 'GET',
      url: inngestUrl,
      timeout: 5000,
      validateStatus: () => true,
    })

    // Inngest должен возвращать 200 или 405 (Method Not Allowed), так как в большинстве
    // случаев он ожидает POST запросы, но при этом доступность подтверждается
    const success = response.status === 200 || response.status === 405

    if (success) {
      logger.info(`✅ Inngest API доступен (${response.status})`)
      return { success: true }
    } else {
      logger.error(`❌ Inngest API недоступен, статус: ${response.status}`)
      return {
        success: false,
        error: `Неверный статус Inngest API: ${response.status}`,
      }
    }
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`❌ Ошибка при проверке Inngest API: ${errorMessage}`)
    return { success: false, error: errorMessage }
  }
}

/**
 * Проверяет доступность внешних API для НейроФото V2
 */
async function testExternalApis(): Promise<{
  success: boolean
  results: { endpoint: ApiEndpoint; success: boolean; error?: string }[]
  error?: string
}> {
  logger.info('🔍 Проверка доступности внешних API для НейроФото V2')

  const results = []
  let allSuccess = true

  for (const endpoint of EXTERNAL_API_ENDPOINTS) {
    if (endpoint.disabled) {
      logger.info(`⏩ Пропуск отключенного эндпоинта: ${endpoint.name}`)
      continue
    }

    const result = await testEndpoint(endpoint, '')
    results.push({
      endpoint,
      success: result.success,
      error: result.error,
    })

    if (!result.success) {
      allSuccess = false
    }
  }

  if (allSuccess) {
    logger.info('✅ Все внешние API доступны')
    return { success: true, results }
  } else {
    const errors = results
      .filter(r => !r.success)
      .map(r => `${r.endpoint.name}: ${r.error}`)
      .join('; ')

    logger.error(`❌ Некоторые внешние API недоступны: ${errors}`)
    return {
      success: false,
      results,
      error: `Недоступные внешние API: ${errors}`,
    }
  }
}

/**
 * Генерирует отчет о результатах тестирования API
 */
function generateApiTestReport(
  results: {
    endpoint: ApiEndpoint
    success: boolean
    error?: string
  }[],
  environment: string,
  externalResults?: {
    endpoint: ApiEndpoint
    success: boolean
    error?: string
  }[]
): string {
  let report = `\n📊 Отчет о проверке API (${environment}):\n`

  const totalCount = results.length
  const successCount = results.filter(r => r.success).length
  const failCount = totalCount - successCount

  report += `\n📈 Статистика: Всего проверено ${totalCount} эндпоинтов, успешно: ${successCount}, неудачно: ${failCount}\n`

  if (failCount > 0) {
    report += '\n❌ Недоступные эндпоинты:\n'

    results
      .filter(r => !r.success)
      .forEach(result => {
        report += `  - ${result.endpoint.name} (${result.endpoint.path}): ${result.error}\n`
      })
  }

  // Добавляем информацию о внешних API, если доступна
  if (externalResults && externalResults.length > 0) {
    const externalTotal = externalResults.length
    const externalSuccess = externalResults.filter(r => r.success).length
    const externalFail = externalTotal - externalSuccess

    report += `\n📡 Внешние API: Всего проверено ${externalTotal}, успешно: ${externalSuccess}, неудачно: ${externalFail}\n`

    if (externalFail > 0) {
      report += '\n❌ Недоступные внешние API:\n'

      externalResults
        .filter(r => !r.success)
        .forEach(result => {
          report += `  - ${result.endpoint.name}: ${result.error}\n`
        })
    }
  }

  return report
}

/**
 * Запускает тесты API эндпоинтов
 * @returns Результат проверки API
 */
export async function runApiTests({
  generateReport = false,
  environment = 'local' as 'local' | 'production' | 'both',
  customUrl,
  testExternalApi = true,
}: {
  generateReport?: boolean
  environment?: 'local' | 'production' | 'both'
  customUrl?: string
  testExternalApi?: boolean
} = {}): Promise<TestResult> {
  // Определяем URL(ы) для тестирования
  const urlsToTest: { env: string; url: string }[] = []

  if (customUrl) {
    urlsToTest.push({ env: 'custom', url: customUrl })
  } else if (environment === 'both') {
    urlsToTest.push({ env: 'local', url: ENVIRONMENTS.local })
    urlsToTest.push({ env: 'production', url: ENVIRONMENTS.production })
  } else {
    urlsToTest.push({
      env: environment,
      url:
        environment === 'local' ? ENVIRONMENTS.local : ENVIRONMENTS.production,
    })
  }

  // Результаты для всех окружений
  const allResults: TestResult[] = []

  // Тестируем внешние API один раз (не зависят от окружения)
  let externalApiResults = null
  if (testExternalApi) {
    externalApiResults = await testExternalApis()
  }

  // Тестируем каждое окружение
  for (const { env, url } of urlsToTest) {
    logger.info(
      `🚀 Запуск тестирования API сервера (окружение: ${env}, URL: ${url})...`
    )

    try {
      const results = []

      // Тестируем все API-эндпоинты
      for (const endpoint of API_ENDPOINTS) {
        const result = await testEndpoint(endpoint, url)
        results.push({
          endpoint,
          success: result.success,
          error: result.error,
        })
      }

      // Дополнительно проверяем доступность Inngest API
      const inngestResult = await testInngestAvailability(url)

      // Общий результат проверки: успешно, если все эндпоинты доступны
      let allSuccess = results.every(r => r.success) && inngestResult.success

      // Если тестируем внешние API, учитываем и их результаты
      if (testExternalApi && externalApiResults) {
        allSuccess = allSuccess && externalApiResults.success
      }

      let message = allSuccess
        ? `Все API эндпоинты работают корректно в окружении ${env}`
        : `${results.filter(r => !r.success).length} из ${results.length} API эндпоинтов недоступны в окружении ${env}`

      if (
        testExternalApi &&
        externalApiResults &&
        !externalApiResults.success
      ) {
        message += `. Также недоступны некоторые внешние API для НейроФото V2.`
      }

      if (generateReport) {
        message += generateApiTestReport(
          results,
          env,
          testExternalApi ? externalApiResults?.results : undefined
        )
      }

      if (allSuccess) {
        logger.info(
          `✅ Все API эндпоинты доступны и работают корректно в окружении ${env}`
        )
      } else {
        logger.error(
          `❌ Обнаружены недоступные API эндпоинты в окружении ${env}`
        )
      }

      const result: TestResult = {
        success: allSuccess,
        name: `API Health Check (${env})`,
        message,
        category: TestCategory.Api,
        details: {
          environment: env,
          baseUrl: url,
          endpoints: results,
          inngest: inngestResult,
          externalApis: testExternalApi ? externalApiResults : undefined,
        },
      }

      allResults.push(result)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error(
        `❌ Ошибка при тестировании API в окружении ${env}: ${errorMessage}`
      )

      const result: TestResult = {
        success: false,
        name: `API Health Check (${env})`,
        message: `Ошибка при тестировании API в окружении ${env}: ${errorMessage}`,
        category: TestCategory.Api,
        error: errorMessage,
        details: {
          environment: env,
          baseUrl: url,
        },
      }

      allResults.push(result)
    }
  }

  // Возвращаем один результат или массив результатов
  return environment === 'both' ? allResults[0] : allResults[0]
}

// Экспортируем функцию тестирования для использования в общей системе тестов
export const testApiHealth = runApiTests

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  const environment = process.env.API_ENV || 'both'
  const testExternalApi = process.env.TEST_EXTERNAL !== 'false'

  runApiTests({
    generateReport: true,
    environment: environment as 'local' | 'production' | 'both',
    testExternalApi,
  })
    .then(results => {
      if (Array.isArray(results)) {
        // Результаты для обоих окружений
        const localResult = results.find(
          r => r.details?.environment === 'local'
        )
        const prodResult = results.find(
          r => r.details?.environment === 'production'
        )

        logger.info('📊 Результаты тестирования API', {
          description: 'API testing results',
          localSuccess: localResult?.success,
          productionSuccess: prodResult?.success,
        })

        // Выходим с ошибкой, если хотя бы одно окружение не прошло тест
        if (!results.every(r => r.success)) {
          process.exit(1)
        }
      } else {
        // Один результат
        logger.info('📊 Результаты тестирования API', {
          description: 'API testing results',
          environment: results.details?.environment,
          success: results.success,
          message: results.message,
        })

        if (!results.success) {
          process.exit(1)
        }
      }
    })
    .catch(error => {
      logger.error(
        `❌ Критическая ошибка при выполнении тестов API: ${error.message}`
      )
      process.exit(1)
    })
}
