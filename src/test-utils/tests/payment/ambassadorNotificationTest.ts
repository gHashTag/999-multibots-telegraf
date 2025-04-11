import { TestResult } from '../../types'
import { logger } from '@/utils/logger'
import { TransactionType } from '@/interfaces/payments.interface'
import { v4 as uuidv4 } from 'uuid'
import {
  AmbassadorNotificationParams,
  getAmbassadorByBotName,
  sendAmbassadorNotification,
} from '@/helpers/sendAmbassadorNotification'
import { TEST_CONFIG } from '../../test-config'
import { createMockFn, MockFunction } from '../../test-config'

/**
 * Тестовые данные для уведомлений амбассадорам
 */
const TEST_NOTIFICATION_PARAMS: AmbassadorNotificationParams = {
  user_telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
  bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
  amount: 100,
  stars: 100,
  transaction_type: TransactionType.MONEY_INCOME,
  description: 'Тестовый платеж',
  operation_id: `test-op-${uuidv4()}`,
}

/**
 * Мок для функции getAmbassadorByBotName
 */
const mockGetAmbassadorByBotName = (
  shouldSucceed: boolean,
  botName: string = TEST_CONFIG.TEST_DATA.TEST_BOT_NAME
) => {
  return createMockFn<string, Promise<any>>().mockReturnValue(
    Promise.resolve(
      shouldSucceed
        ? {
            telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
            bot_name: botName,
            group: 'test_group',
          }
        : null
    )
  )
}

/**
 * Мок для Telegram.sendMessage
 */
const mockTelegramSendMessage = (shouldSucceed: boolean = true) => {
  return createMockFn<
    [string | number, string, any],
    Promise<any>
  >().mockReturnValue(
    shouldSucceed
      ? Promise.resolve({ message_id: 12345 })
      : Promise.reject(new Error('Failed to send message'))
  )
}

/**
 * Проверяет отправку уведомления амбассадору при успешном сценарии
 */
async function testAmbassadorNotificationSuccess(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста успешной отправки уведомления амбассадору', {
      description: 'Testing successful ambassador notification',
    })

    // Создаем моки
    const getAmbassadorMock = mockGetAmbassadorByBotName(true)
    const sendMessageMock = mockTelegramSendMessage(true)

    // Переопределяем оригинальные функции
    const originalGetAmbassador = jest.spyOn(
      await import('@/helpers/sendAmbassadorNotification'),
      'getAmbassadorByBotName'
    )
    originalGetAmbassador.mockImplementation(getAmbassadorMock)

    // Заменяем конструктор Telegram
    const originalTelegram = jest.spyOn(await import('telegraf'), 'Telegram')
    originalTelegram.mockReturnValue({
      sendMessage: sendMessageMock,
    } as any)

    // Временно отключаем isDev
    const originalIsDev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      // Отправляем уведомление
      const result = await sendAmbassadorNotification(TEST_NOTIFICATION_PARAMS)

      // Проверяем, что уведомление было отправлено успешно
      if (!result.success) {
        logger.error(
          '❌ Ожидалась успешная отправка уведомления, но получена ошибка',
          {
            description: 'Expected successful notification, but got error',
            result,
          }
        )
        return {
          success: false,
          name: 'Тест успешной отправки уведомления амбассадору',
          message: 'Уведомление не было отправлено успешно',
          details: { result },
        }
      }

      // Проверяем, что getAmbassadorByBotName был вызван с правильными параметрами
      if (
        getAmbassadorMock.calls.length !== 1 ||
        getAmbassadorMock.calls[0] !== TEST_NOTIFICATION_PARAMS.bot_name
      ) {
        logger.error('❌ Некорректный вызов getAmbassadorByBotName', {
          description: 'Incorrect getAmbassadorByBotName call',
          calls: getAmbassadorMock.calls,
        })
        return {
          success: false,
          name: 'Тест успешной отправки уведомления амбассадору',
          message: 'Некорректный вызов getAmbassadorByBotName',
          details: { calls: getAmbassadorMock.calls },
        }
      }

      // Проверяем, что sendMessage был вызван
      if (sendMessageMock.calls.length !== 1) {
        logger.error('❌ Отсутствует вызов sendMessage', {
          description: 'Missing sendMessage call',
          calls: sendMessageMock.calls,
        })
        return {
          success: false,
          name: 'Тест успешной отправки уведомления амбассадору',
          message: 'Не был вызван sendMessage',
          details: { calls: sendMessageMock.calls },
        }
      }

      logger.info('✅ Тест успешно пройден', {
        description: 'Test passed',
      })

      return {
        success: true,
        name: 'Тест успешной отправки уведомления амбассадору',
        message: 'Уведомление было успешно отправлено',
        details: {
          getAmbassadorCalls: getAmbassadorMock.calls,
          sendMessageCalls: sendMessageMock.calls,
        },
      }
    } finally {
      // Восстанавливаем оригинальные функции
      originalGetAmbassador.mockRestore()
      originalTelegram.mockRestore()

      // Восстанавливаем isDev
      process.env.NODE_ENV = originalIsDev
    }
  } catch (error) {
    logger.error('❌ Ошибка при выполнении теста', {
      description: 'Error running test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'Тест успешной отправки уведомления амбассадору',
      message: 'Произошла ошибка при выполнении теста',
      details: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }
  }
}

/**
 * Проверяет обработку ошибки при отсутствии амбассадора
 */
async function testAmbassadorNotificationNoAmbassador(): Promise<TestResult> {
  try {
    logger.info(
      '🚀 Запуск теста отправки уведомления при отсутствии амбассадора',
      {
        description: 'Testing ambassador notification with no ambassador found',
      }
    )

    // Мокируем поиск амбассадора (не найден)
    const getAmbassadorMock = mockGetAmbassadorByBotName(false)

    // Переопределяем оригинальные функции
    const originalGetAmbassador = jest.spyOn(
      await import('@/helpers/sendAmbassadorNotification'),
      'getAmbassadorByBotName'
    )
    originalGetAmbassador.mockImplementation(getAmbassadorMock)

    try {
      // Отправляем уведомление
      const result = await sendAmbassadorNotification(TEST_NOTIFICATION_PARAMS)

      // Проверяем, что уведомление не было отправлено (ожидаемое поведение)
      if (result.success) {
        logger.error(
          '❌ Ожидалась ошибка при отправке уведомления, но получен успех',
          {
            description: 'Expected error, but got success',
            result,
          }
        )
        return {
          success: false,
          name: 'Тест отправки уведомления при отсутствии амбассадора',
          message: 'Ожидалась ошибка, но получен успех',
          details: { result },
        }
      }

      // Проверяем сообщение об ошибке
      if (!result.message?.includes('not found')) {
        logger.error('❌ Некорректное сообщение об ошибке', {
          description: 'Incorrect error message',
          message: result.message,
        })
        return {
          success: false,
          name: 'Тест отправки уведомления при отсутствии амбассадора',
          message: 'Некорректное сообщение об ошибке',
          details: { errorMessage: result.message },
        }
      }

      logger.info('✅ Тест успешно пройден', {
        description: 'Test passed',
      })

      return {
        success: true,
        name: 'Тест отправки уведомления при отсутствии амбассадора',
        message: 'Корректная обработка отсутствия амбассадора',
        details: {
          getAmbassadorCalls: getAmbassadorMock.calls,
          errorMessage: result.message,
        },
      }
    } finally {
      // Восстанавливаем оригинальные функции
      originalGetAmbassador.mockRestore()
    }
  } catch (error) {
    logger.error('❌ Ошибка при выполнении теста', {
      description: 'Error running test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'Тест отправки уведомления при отсутствии амбассадора',
      message: 'Произошла ошибка при выполнении теста',
      details: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }
  }
}

/**
 * Запускает все тесты для уведомлений амбассадорам
 */
export async function testAmbassadorNotifications(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск тестов уведомлений амбассадорам', {
      description: 'Running ambassador notification tests',
    })

    const results = [
      await testAmbassadorNotificationSuccess(),
      await testAmbassadorNotificationNoAmbassador(),
    ]

    // Проверяем результаты
    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const success = failedTests === 0

    logger.info(
      `${success ? '✅' : '❌'} Результаты тестов уведомлений амбассадорам`,
      {
        description: 'Ambassador notification test results',
        passedTests,
        failedTests,
        totalTests: results.length,
      }
    )

    return {
      success,
      name: 'Тесты уведомлений амбассадорам',
      message: success
        ? '✅ Все тесты уведомлений амбассадорам успешно пройдены'
        : `❌ ${failedTests} из ${results.length} тестов не пройдены`,
      details: results,
    }
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов уведомлений амбассадорам', {
      description: 'Error running ambassador notification tests',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'Тесты уведомлений амбассадорам',
      message: 'Произошла ошибка при запуске тестов',
      details: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }
  }
}
