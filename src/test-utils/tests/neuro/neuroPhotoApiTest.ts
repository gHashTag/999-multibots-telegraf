import { TestResult } from '@/test-utils/types'
import { TestCategory } from '@/test-utils/core/categories'
import { logger } from '@/utils/logger'
import axios from 'axios'
import * as dotenv from 'dotenv'

// Загружаем переменные окружения из .env.test
dotenv.config({ path: '.env.test' })

// Типы для результатов API-проверок
interface ApiCheckError {
  code?: string
  message: string
  response?: any
}

interface ApiCheckResult {
  success: boolean
  message: string
  response: any | null
  error: ApiCheckError | null
}

// Эндпоинты API для тестирования
const NEUROPHOTO_API_ENDPOINTS = {
  // Внутренние API (webhook)
  internal: {
    webhook: process.env.WEBHOOK_URL || 'http://localhost:3333/webhook',
  },
  // Внешние API (BFL)
  external: {
    bflStandard: 'https://api.bflsupreme.dev/v1/image-generation',
    bflFineTuned: 'https://api.bflsupreme.dev/v1/fine-tuned-image-generation',
  },
}

// Опции для теста
interface TestOptions {
  baseUrl?: string
  bflApiKey?: string
  generateReport?: boolean
}

/**
 * Тестирует доступность API НейроФото
 */
export async function testNeuroPhotoApi(
  options: TestOptions = {}
): Promise<TestResult> {
  const {
    baseUrl = NEUROPHOTO_API_ENDPOINTS.internal.webhook,
    bflApiKey = process.env.BFL_API_KEY,
    generateReport = true,
  } = options

  const startTime = Date.now()

  logger.info({
    message: '🚀 Запуск теста API НейроФото',
    description: 'Starting NeuroPhoto API test',
    baseUrl,
    hasBflApiKey: !!bflApiKey,
  })

  // Результаты проверок
  const results: {
    internal: { webhook: ApiCheckResult }
    external: { bflStandard: ApiCheckResult; bflFineTuned: ApiCheckResult }
  } = {
    internal: {
      webhook: { success: false, message: '', response: null, error: null },
    },
    external: {
      bflStandard: { success: false, message: '', response: null, error: null },
      bflFineTuned: {
        success: false,
        message: '',
        response: null,
        error: null,
      },
    },
  }

  // Проверка внутреннего вебхука
  try {
    logger.info({
      message: '🔍 Проверка доступности внутреннего вебхука',
      description: 'Checking internal webhook availability',
      url: baseUrl,
    })

    const response = await axios.get(`${baseUrl}/health`, {
      timeout: 5000,
    })

    results.internal.webhook.success = response.status === 200
    results.internal.webhook.message = `API вернул статус ${response.status}`
    results.internal.webhook.response = response.data

    logger.info({
      message: '✅ Проверка внутреннего вебхука успешна',
      description: 'Internal webhook check successful',
      status: response.status,
      data: response.data,
    })
  } catch (error) {
    results.internal.webhook.success = false

    if (axios.isAxiosError(error)) {
      results.internal.webhook.message = `Ошибка ${error.code}: ${error.message}`
      results.internal.webhook.error = {
        code: error.code,
        message: error.message,
        response: error.response?.data,
      }
    } else {
      results.internal.webhook.message = `Неизвестная ошибка: ${String(error)}`
      results.internal.webhook.error = {
        message: String(error),
      }
    }

    logger.error({
      message: '❌ Ошибка при проверке внутреннего вебхука',
      description: 'Error checking internal webhook',
      error: results.internal.webhook.error,
    })
  }

  // Проверка API BFL, если ключ API предоставлен
  if (bflApiKey) {
    // Проверка стандартного API BFL
    try {
      logger.info({
        message: '🔍 Проверка доступности стандартного API BFL',
        description: 'Checking BFL standard API availability',
        url: NEUROPHOTO_API_ENDPOINTS.external.bflStandard,
      })

      const response = await axios.get(
        `${NEUROPHOTO_API_ENDPOINTS.external.bflStandard}/models`,
        {
          headers: {
            Authorization: `Bearer ${bflApiKey}`,
          },
          timeout: 5000,
        }
      )

      results.external.bflStandard.success = response.status === 200
      results.external.bflStandard.message = `API вернул статус ${response.status}`
      results.external.bflStandard.response = response.data

      logger.info({
        message: '✅ Проверка стандартного API BFL успешна',
        description: 'BFL standard API check successful',
        status: response.status,
        modelsCount: Array.isArray(response.data)
          ? response.data.length
          : 'N/A',
      })
    } catch (error) {
      results.external.bflStandard.success = false

      if (axios.isAxiosError(error)) {
        results.external.bflStandard.message = `Ошибка ${error.code}: ${error.message}`
        results.external.bflStandard.error = {
          code: error.code,
          message: error.message,
          response: error.response?.data,
        }
      } else {
        results.external.bflStandard.message = `Неизвестная ошибка: ${String(error)}`
        results.external.bflStandard.error = {
          message: String(error),
        }
      }

      logger.error({
        message: '❌ Ошибка при проверке стандартного API BFL',
        description: 'Error checking BFL standard API',
        error: results.external.bflStandard.error,
      })
    }

    // Проверка API тонкой настройки BFL
    try {
      logger.info({
        message: '🔍 Проверка доступности API тонкой настройки BFL',
        description: 'Checking BFL fine-tuned API availability',
        url: NEUROPHOTO_API_ENDPOINTS.external.bflFineTuned,
      })

      const response = await axios.get(
        `${NEUROPHOTO_API_ENDPOINTS.external.bflFineTuned}/models`,
        {
          headers: {
            Authorization: `Bearer ${bflApiKey}`,
          },
          timeout: 5000,
        }
      )

      results.external.bflFineTuned.success = response.status === 200
      results.external.bflFineTuned.message = `API вернул статус ${response.status}`
      results.external.bflFineTuned.response = response.data

      logger.info({
        message: '✅ Проверка API тонкой настройки BFL успешна',
        description: 'BFL fine-tuned API check successful',
        status: response.status,
        modelsCount: Array.isArray(response.data)
          ? response.data.length
          : 'N/A',
      })
    } catch (error) {
      results.external.bflFineTuned.success = false

      if (axios.isAxiosError(error)) {
        results.external.bflFineTuned.message = `Ошибка ${error.code}: ${error.message}`
        results.external.bflFineTuned.error = {
          code: error.code,
          message: error.message,
          response: error.response?.data,
        }
      } else {
        results.external.bflFineTuned.message = `Неизвестная ошибка: ${String(error)}`
        results.external.bflFineTuned.error = {
          message: String(error),
        }
      }

      logger.error({
        message: '❌ Ошибка при проверке API тонкой настройки BFL',
        description: 'Error checking BFL fine-tuned API',
        error: results.external.bflFineTuned.error,
      })
    }
  } else {
    logger.warn({
      message: '⚠️ Ключ API BFL не предоставлен, пропуск проверки внешних API',
      description: 'BFL API key not provided, skipping external API checks',
    })
  }

  // Генерация отчета
  if (generateReport) {
    const endTime = Date.now()
    const duration = endTime - startTime

    // Общий успех: внутренний вебхук должен быть доступен
    // Если ключ API предоставлен, то хотя бы один из внешних API также должен быть доступен
    const overallSuccess =
      results.internal.webhook.success &&
      (!bflApiKey ||
        results.external.bflStandard.success ||
        results.external.bflFineTuned.success)

    // Генерация сообщения
    const statusMessage = overallSuccess
      ? 'API НейроФото доступен и функционирует'
      : 'Проблемы с доступностью API НейроФото'

    // Детализация по результатам проверок
    const details = {
      duration,
      webhook: results.internal.webhook.success,
      bflStandard: bflApiKey
        ? results.external.bflStandard.success
        : 'Не проверено',
      bflFineTuned: bflApiKey
        ? results.external.bflFineTuned.success
        : 'Не проверено',
      results,
    }

    logger.info({
      message: overallSuccess
        ? '✅ Тест API НейроФото успешно завершен'
        : '❌ Тест API НейроФото завершен с ошибками',
      description: overallSuccess
        ? 'NeuroPhoto API test completed successfully'
        : 'NeuroPhoto API test completed with errors',
      duration: `${duration}ms`,
      details,
    })

    // Возвращаем результат теста
    return {
      success: overallSuccess,
      name: 'НейроФото API',
      message: statusMessage,
      category: TestCategory.Api,
      details,
    }
  }

  // Если отчет не требуется, просто возвращаем результаты проверок
  return {
    success: results.internal.webhook.success,
    name: 'НейроФото API',
    message: results.internal.webhook.success
      ? 'API НейроФото доступен'
      : 'Проблемы с доступностью API НейроФото',
    category: TestCategory.Api,
    details: results,
  }
}
