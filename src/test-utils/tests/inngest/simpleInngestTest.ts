import { logger } from '../../../utils/logger'
import { TestResult } from '../../types'
import { TestCategory } from '../../core/categories'
import fetch from 'node-fetch'

/**
 * Проверяет подключение к Inngest с использованием HTTP API
 *
 * @returns Promise<TestResult> - Результат теста
 */
export async function testInngestConnectivity(): Promise<TestResult> {
  try {
    logger.info(
      '🚀 [INNGEST_CONNECTIVITY_TEST]: Начало теста доступности Inngest',
      {
        description: 'Starting Inngest connectivity test',
      }
    )

    // Проверяем наличие необходимых переменных окружения
    const inngestEventKey = process.env.INNGEST_EVENT_KEY
    const inngestUrl = process.env.INNGEST_URL || 'https://api.inngest.com'
    const inngestBaseUrl = process.env.INNGEST_BASE_URL
    const inngestBaseDockerUrl = process.env.INNGEST_BASE_DOCKER_URL
    const inngestWebhookUrl = process.env.INNGEST_WEBHOOK_URL
    const inngestSigningKey = process.env.INNGEST_SIGNING_KEY
    const isDev = process.env.INNGEST_DEV === '1'

    logger.info(
      'ℹ️ [INNGEST_CONNECTIVITY_TEST]: Проверка переменных окружения',
      {
        description: 'Checking environment variables',
        inngestEventKey: inngestEventKey ? 'Установлен' : 'Не установлен',
        inngestSigningKey: inngestSigningKey ? 'Установлен' : 'Не установлен',
        inngestUrl,
        inngestBaseUrl,
        inngestBaseDockerUrl,
        inngestWebhookUrl,
        isDev,
        nodeEnv: process.env.NODE_ENV,
      }
    )

    if (!inngestEventKey) {
      throw new Error('INNGEST_EVENT_KEY не установлен')
    }

    // Проверяем доступность Inngest API
    const isProdAvailable = await checkEndpointAvailability(
      'https://api.inngest.com'
    )
    const isLocalAvailable = inngestBaseUrl
      ? await checkEndpointAvailability(inngestBaseUrl)
      : false
    const isDockerAvailable = inngestBaseDockerUrl
      ? await checkEndpointAvailability(inngestBaseDockerUrl)
      : false

    logger.info(
      'ℹ️ [INNGEST_CONNECTIVITY_TEST]: Результаты проверки доступности',
      {
        description: 'Endpoint availability check results',
        prodApiAvailable: isProdAvailable,
        localApiAvailable: isLocalAvailable,
        dockerApiAvailable: isDockerAvailable,
      }
    )

    return {
      success: true,
      message: `Тест подключения к Inngest успешно пройден. Inngest API ${isProdAvailable ? 'доступен' : 'недоступен'}`,
      name: 'Inngest Connectivity Test',
      category: TestCategory.Inngest,
      details: {
        isProdAvailable,
        isLocalAvailable,
        isDockerAvailable,
      },
    }
  } catch (error) {
    logger.error(
      '❌ [INNGEST_CONNECTIVITY_TEST]: Ошибка выполнения теста подключения к Inngest',
      {
        description: 'Error during Inngest connectivity test',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
    )

    return {
      success: false,
      message: `Ошибка теста подключения к Inngest: ${error instanceof Error ? error.message : String(error)}`,
      name: 'Inngest Connectivity Test',
      category: TestCategory.Inngest,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Проверяет доступность HTTP-эндпоинта
 *
 * @param url - URL для проверки
 * @returns Promise<boolean> - true если эндпоинт доступен
 */
async function checkEndpointAvailability(url: string): Promise<boolean> {
  try {
    logger.info('🔍 [INNGEST_CONNECTIVITY_TEST]: Проверка доступности URL', {
      description: 'Checking endpoint availability',
      url,
    })

    const response = await fetch(url, {
      method: 'HEAD',
    })

    const isAvailable = response.ok || response.status < 500

    logger.info(
      `${isAvailable ? '✅' : '❌'} [INNGEST_CONNECTIVITY_TEST]: Эндпоинт ${url} ${isAvailable ? 'доступен' : 'недоступен'}`,
      {
        description: `Endpoint ${url} ${isAvailable ? 'is available' : 'is not available'}`,
        status: response.status,
        statusText: response.statusText,
      }
    )

    return isAvailable
  } catch (error) {
    logger.error(
      '❌ [INNGEST_CONNECTIVITY_TEST]: Ошибка при проверке доступности URL',
      {
        description: 'Error occurred while checking endpoint availability',
        url,
        error: error instanceof Error ? error.message : String(error),
      }
    )

    return false
  }
}
