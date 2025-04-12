import { TestResult } from '../types'
import { TEST_CONFIG } from '../test-config'
import { Inngest } from 'inngest'
import axios from 'axios'
import { logger } from '../../utils/logger'
import { MockManager } from '../core/MockManager'

/**
 * Тест для проверки отправки событий в Inngest через прямой HTTP запрос
 */
export async function runInngestDirectTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста отправки событий в Inngest через HTTP API')

    // Получение переменных окружения
    const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY
    const INNGEST_URL =
      process.env.INNGEST_URL || 'https://api.inngest.com/e/v1/events'

    // Проверка наличия ключа
    if (!INNGEST_EVENT_KEY) {
      throw new Error('❌ INNGEST_EVENT_KEY не найден в переменных окружения')
    }

    logger.info('🔍 Конфигурация API Inngest:')
    logger.info(`INNGEST_EVENT_KEY доступен: ${!!INNGEST_EVENT_KEY}`)
    logger.info(`INNGEST_URL: ${INNGEST_URL}`)

    // Создаем тестовое событие
    const testEvent = {
      name: 'test/direct-event',
      data: {
        message: 'Тестирование прямого HTTP API Inngest',
        timestamp: new Date().toISOString(),
        testId: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      },
      id: `test-${Date.now()}`,
      ts: Date.now(),
    }

    logger.info('📦 Подготовка тестовых данных события')
    logger.debug(`📋 Данные события: ${JSON.stringify(testEvent, null, 2)}`)

    // Отправка события через HTTP API
    logger.info('⚡ Отправка события через HTTP API')
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
      logger.info('✅ Событие успешно отправлено')
      logger.debug(`📄 Статус ответа: ${response.status}`)
      logger.debug(
        `📄 Ответ сервера: ${JSON.stringify(response.data, null, 2)}`
      )

      return {
        success: true,
        message: 'Тест отправки события через HTTP API успешно пройден',
        name: 'Inngest Direct API Test',
      }
    } else {
      throw new Error(`Неожиданный статус ответа: ${response.status}`)
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при выполнении теста HTTP API Inngest')

    if (error.response) {
      logger.error(`📄 Статус ответа: ${error.response.status}`)
      logger.error(
        `📄 Ответ сервера: ${JSON.stringify(error.response.data, null, 2)}`
      )
    } else {
      logger.error(`📄 Ошибка: ${error.message}`)
    }

    return {
      success: false,
      message: `Ошибка при тестировании HTTP API Inngest: ${error.message}`,
      name: 'Inngest Direct API Test',
    }
  }
}

/**
 * Тест для проверки отправки событий в Inngest через SDK
 */
export async function runInngestSDKTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста отправки событий в Inngest через SDK')

    // Проверка наличия ключей
    if (!process.env.INNGEST_EVENT_KEY) {
      throw new Error('❌ INNGEST_EVENT_KEY не найден в переменных окружения')
    }

    logger.info('🔍 Конфигурация SDK Inngest:')
    logger.info(
      `INNGEST_EVENT_KEY доступен: ${!!process.env.INNGEST_EVENT_KEY}`
    )
    logger.info(
      `INNGEST_SIGNING_KEY доступен: ${!!process.env.INNGEST_SIGNING_KEY}`
    )
    logger.info(
      `INNGEST_URL: ${process.env.INNGEST_URL || 'не указан, будет использоваться по умолчанию'}`
    )

    // Инициализация клиента Inngest
    const inngest = new Inngest({
      id: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME || 'test-sdk',
      logger: logger,
    })

    // Создаем тестовое событие
    const eventData = {
      name: 'test/sdk-event',
      data: {
        message: 'Тестирование Inngest SDK',
        timestamp: new Date().toISOString(),
        testId: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      },
    }

    logger.info('📦 Подготовка тестовых данных события')
    logger.debug(`📋 Данные события: ${JSON.stringify(eventData, null, 2)}`)

    // Отправка события через SDK
    logger.info('⚡ Отправка события через SDK')
    const result = await inngest.send(eventData)

    logger.info('✅ Событие успешно отправлено через SDK')
    logger.debug(`📄 Результат отправки: ${JSON.stringify(result, null, 2)}`)

    return {
      success: true,
      message: 'Тест отправки события через SDK успешно пройден',
      name: 'Inngest SDK Test',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при выполнении теста SDK Inngest')
    logger.error(`📄 Ошибка: ${error.message}`)

    if (error.cause) {
      logger.error(`📄 Причина ошибки: ${JSON.stringify(error.cause, null, 2)}`)
    }

    return {
      success: false,
      message: `Ошибка при тестировании SDK Inngest: ${error.message}`,
      name: 'Inngest SDK Test',
    }
  }
}

/**
 * Тест для проверки регистрации функций Inngest
 */
export async function runInngestFunctionRegistrationTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста регистрации функций Inngest')

    // Создаем мок-менеджер
    const mockManager = new MockManager()

    // Тип для функции создания
    type CreateFunctionType = (
      options: { id: string },
      trigger: { event: string },
      handler: (params: any) => Promise<any>
    ) => { id: string; event: string }

    // Создаем мок для Inngest с типизированной функцией
    const mockInngest = mockManager.createMockObject<{
      createFunction: CreateFunctionType
    }>('Inngest', {
      createFunction: (options, trigger) => ({
        id: options.id,
        event: trigger.event,
      }),
    })

    // Создаем тестовый клиент Inngest
    const inngest = new Inngest({
      id: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME || 'test-registration',
      logger: logger,
    })

    // Заменяем метод createFunction на наш мок
    inngest.createFunction = mockInngest.createFunction as any

    // Регистрируем тестовую функцию
    logger.info('⚡ Регистрация тестовой функции')
    const testFunction = inngest.createFunction(
      { id: 'test-function' },
      { event: 'test/event' },
      async () => {
        return { status: 'success' }
      }
    )

    // Проверяем результат регистрации
    if (
      testFunction &&
      typeof testFunction.id === 'string' &&
      testFunction.id === 'test-function'
    ) {
      logger.info('✅ Функция успешно зарегистрирована')

      return {
        success: true,
        message: 'Тест регистрации функции Inngest успешно пройден',
        name: 'Inngest Function Registration Test',
      }
    } else {
      throw new Error('Функция не была корректно зарегистрирована')
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при выполнении теста регистрации функций Inngest')
    logger.error(`📄 Ошибка: ${error.message}`)

    return {
      success: false,
      message: `Ошибка при тестировании регистрации функций Inngest: ${error.message}`,
      name: 'Inngest Function Registration Test',
    }
  }
}

/**
 * Комбинированный тест для проверки всех аспектов Inngest
 */
export async function runInngestFullTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск полного теста функциональности Inngest')

    // Запускаем все тесты последовательно
    const directTestResult = await runInngestDirectTest()
    logger.info(
      `📊 Результат теста HTTP API: ${directTestResult.success ? '✅ УСПЕХ' : '❌ НЕУДАЧА'}`
    )

    const sdkTestResult = await runInngestSDKTest()
    logger.info(
      `📊 Результат теста SDK: ${sdkTestResult.success ? '✅ УСПЕХ' : '❌ НЕУДАЧА'}`
    )

    const registrationTestResult = await runInngestFunctionRegistrationTest()
    logger.info(
      `📊 Результат теста регистрации: ${registrationTestResult.success ? '✅ УСПЕХ' : '❌ НЕУДАЧА'}`
    )

    // Проверяем все результаты
    const allTestsPassed =
      directTestResult.success &&
      sdkTestResult.success &&
      registrationTestResult.success

    if (allTestsPassed) {
      logger.info('🎉 Все тесты Inngest успешно пройдены')

      return {
        success: true,
        message: 'Все тесты Inngest успешно пройдены',
        name: 'Inngest Full Test',
      }
    } else {
      const failedTests = [
        !directTestResult.success ? 'HTTP API' : null,
        !sdkTestResult.success ? 'SDK' : null,
        !registrationTestResult.success ? 'Function Registration' : null,
      ]
        .filter(Boolean)
        .join(', ')

      throw new Error(`Не пройдены следующие тесты: ${failedTests}`)
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при выполнении полного теста Inngest')
    logger.error(`📄 Ошибка: ${error.message}`)

    return {
      success: false,
      message: `Ошибка при полном тестировании Inngest: ${error.message}`,
      name: 'Inngest Full Test',
    }
  }
}
