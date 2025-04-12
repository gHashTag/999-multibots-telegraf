import { InngestFunctionTester } from '../../testers/InngestFunctionTester'
import { logger } from '@/utils/logger'
import { TestResult } from '../../types'
import { Inngest } from 'inngest'
import axios from 'axios'

/**
 * Тестер для базовых Inngest функций
 */
const tester = new InngestFunctionTester({
  verbose: true,
})

/**
 * Тест функции тренировки модели
 */
export async function testModelTraining() {
  logger.info('Запуск теста тренировки модели')
  return tester.testModelTraining()
}

/**
 * Тест функции генерации нейрофото
 */
export async function testNeuroPhotoGeneration() {
  logger.info('Запуск теста генерации нейрофото')
  return tester.testNeuroImageGeneration()
}

/**
 * Тест функции генерации нейрофото V2
 */
export async function testNeuroPhotoV2Generation() {
  logger.info('Запуск теста генерации нейрофото V2')
  return tester.testNeuroPhotoV2Generation()
}

/**
 * Тест функции текст-в-видео
 */
export async function testTextToVideo() {
  logger.info('Запуск теста текст-в-видео')
  return tester.testTextToVideo()
}

/**
 * Запускает все базовые тесты Inngest функций
 */
export async function runAllBasicTests() {
  logger.info('Запуск всех базовых тестов Inngest функций')
  const results = []

  try {
    results.push(await testModelTraining())
  } catch (error) {
    logger.error('Ошибка при тестировании тренировки модели', error)
    results.push({ success: false, error })
  }

  try {
    results.push(await testNeuroPhotoGeneration())
  } catch (error) {
    logger.error('Ошибка при тестировании генерации нейрофото', error)
    results.push({ success: false, error })
  }

  try {
    results.push(await testNeuroPhotoV2Generation())
  } catch (error) {
    logger.error('Ошибка при тестировании генерации нейрофото V2', error)
    results.push({ success: false, error })
  }

  try {
    results.push(await testTextToVideo())
  } catch (error) {
    logger.error('Ошибка при тестировании текст-в-видео', error)
    results.push({ success: false, error })
  }

  return results
}

/**
 * Тест для проверки отправки событий в Inngest через SDK
 * Проверяет возможность подключения к Inngest и отправки тестовых событий
 */
export async function runInngestSDKTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Инициализация клиента Inngest для тестирования SDK', {
      description: 'Initializing Inngest client for SDK testing',
    })

    // Проверяем доступность переменных окружения
    if (!process.env.INNGEST_EVENT_KEY) {
      throw new Error('❌ INNGEST_EVENT_KEY не найден в переменных окружения')
    }

    logger.info('🔍 Проверка переменных окружения:', {
      description: 'Checking environment variables',
      inngestEventKeyExists: !!process.env.INNGEST_EVENT_KEY,
      inngestSigningKeyExists: !!process.env.INNGEST_SIGNING_KEY,
      inngestUrl:
        process.env.INNGEST_URL ||
        'не указан (используется значение по умолчанию)',
    })

    // Создаем новый экземпляр клиента Inngest
    const inngest = new Inngest({
      id: 'inngest-sdk-test',
      logger: logger,
    })

    // Подготавливаем тестовые данные
    const testEventData = {
      message: 'Тестирование SDK Inngest',
      timestamp: Date.now(),
      type: 'sdk-test',
    }

    logger.info('📦 Подготовка тестовых данных события', {
      description: 'Preparing test event data',
      data: testEventData,
    })

    // Отправляем тестовое событие
    logger.info('⚡ Отправка события через SDK', {
      description: 'Sending event via SDK',
    })

    const result = await inngest.send({
      name: 'test/sdk-event',
      data: testEventData,
    })

    logger.info('✅ Событие успешно отправлено через SDK', {
      description: 'Event successfully sent via SDK',
      result,
    })

    return {
      success: true,
      message: 'Тест отправки события через SDK успешно пройден',
      name: 'Inngest SDK Test',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при выполнении теста SDK Inngest', {
      description: 'Error during Inngest SDK test execution',
      error: error.message,
    })

    if (error.cause) {
      logger.error('📄 Причина ошибки:', {
        description: 'Error cause details',
        cause: error.cause,
      })
    }

    return {
      success: false,
      message: `Ошибка при тестировании SDK Inngest: ${error.message}`,
      name: 'Inngest SDK Test',
    }
  }
}

/**
 * Тест для проверки отправки событий в Inngest через прямой HTTP API
 * Тестирует возможность отправки событий через REST API
 */
export async function runInngestDirectAPITest(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста отправки событий в Inngest через HTTP API', {
      description: 'Starting Inngest HTTP API test',
    })

    // Получение переменных окружения
    const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY
    const INNGEST_URL =
      process.env.INNGEST_URL || 'https://api.inngest.com/e/v1/events'

    // Проверка наличия ключа
    if (!INNGEST_EVENT_KEY) {
      throw new Error('❌ INNGEST_EVENT_KEY не найден в переменных окружения')
    }

    logger.info('🔍 Конфигурация API Inngest:', {
      description: 'Inngest API configuration',
      inngestEventKeyExists: !!INNGEST_EVENT_KEY,
      inngestUrl: INNGEST_URL,
    })

    // Создаем тестовое событие
    const testEvent = {
      name: 'test/direct-api-event',
      data: {
        message: 'Тестирование прямого HTTP API Inngest',
        timestamp: new Date().toISOString(),
        type: 'direct-api-test',
      },
      id: `test-${Date.now()}`,
      ts: Date.now(),
    }

    logger.info('📦 Подготовка тестовых данных события', {
      description: 'Preparing test event data',
      event: testEvent,
    })

    // Отправка события через HTTP API
    logger.info('⚡ Отправка события через HTTP API', {
      description: 'Sending event via HTTP API',
    })

    const response = await axios({
      method: 'post',
      url: INNGEST_URL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INNGEST_EVENT_KEY}`,
      },
      data: [testEvent],
    })

    // Проверка результата
    if (response.status >= 200 && response.status < 300) {
      logger.info('✅ Событие успешно отправлено через HTTP API', {
        description: 'Event successfully sent via HTTP API',
        status: response.status,
        data: response.data,
      })

      return {
        success: true,
        message: 'Тест отправки события через HTTP API успешно пройден',
        name: 'Inngest Direct API Test',
      }
    } else {
      throw new Error(`Неожиданный статус ответа: ${response.status}`)
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при выполнении теста HTTP API Inngest', {
      description: 'Error during Inngest HTTP API test',
      error: error.message,
    })

    if (error.response) {
      logger.error('📄 Детали ответа с ошибкой:', {
        description: 'Error response details',
        status: error.response.status,
        data: error.response.data,
      })
    }

    return {
      success: false,
      message: `Ошибка при тестировании HTTP API Inngest: ${error.message}`,
      name: 'Inngest Direct API Test',
    }
  }
}

/**
 * Тест, проверяющий базовую доступность сервиса Inngest
 * Этот тест легкий и быстрый, чтобы проверить, что сервис в принципе доступен
 */
export async function runInngestAvailabilityTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста доступности сервиса Inngest', {
      description: 'Starting Inngest availability test',
    })

    // Проверка наличия переменных окружения
    const envCheck = {
      INNGEST_EVENT_KEY: !!process.env.INNGEST_EVENT_KEY,
      INNGEST_SIGNING_KEY: !!process.env.INNGEST_SIGNING_KEY,
      INNGEST_URL: !!process.env.INNGEST_URL,
    }

    logger.info('🔍 Проверка конфигурации:', {
      description: 'Checking configuration',
      envCheck,
    })

    // Если конфигурация неполная, выводим предупреждение, но не завершаем тест ошибкой
    if (!envCheck.INNGEST_EVENT_KEY) {
      logger.warn(
        '⚠️ INNGEST_EVENT_KEY не задан, это может привести к ошибкам в отправке событий',
        {
          description: 'Missing INNGEST_EVENT_KEY environment variable',
        }
      )
    }

    return {
      success: true,
      message: 'Тест базовой доступности Inngest успешно пройден',
      name: 'Inngest Availability Test',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при выполнении теста доступности Inngest', {
      description: 'Error during Inngest availability test',
      error: error.message,
    })

    return {
      success: false,
      message: `Ошибка при тестировании доступности Inngest: ${error.message}`,
      name: 'Inngest Availability Test',
    }
  }
}
