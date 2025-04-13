import { logger } from '@/utils/logger'
import { inngestTestEngine, TEST_CONFIG } from '../../test-config'
import { TestResult } from '../../types'
import { ModeEnum } from '@/interfaces/modes'
import { TransactionType } from '@/interfaces/payments.interface'

/**
 * Модуль содержит тесты для проверки работы процессора платежей через InngestTestEngine
 *
 * @module src/test-utils/tests/payment/paymentInngestTest
 */

/**
 * Проверяет отправку и обработку событий платежей с использованием InngestTestEngine
 *
 * @returns {Promise<TestResult>} - Результат выполнения теста
 */
export async function testPaymentInngestEvents(): Promise<TestResult> {
  try {
    logger.info('🚀 Запускаем тест событий платежей через InngestTestEngine', {
      description: 'Starting payment events test through InngestTestEngine',
    })

    // Очищаем историю событий перед началом теста
    inngestTestEngine.clearEvents()

    // Создаем тестовое событие пополнения баланса
    const depositEvent = {
      name: 'payment/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
        amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT,
        stars: TEST_CONFIG.TEST_DATA.TEST_STARS,
        type: TransactionType.MONEY_INCOME,
        description: 'Тестовое пополнение баланса через InngestTestEngine',
        bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
        service_type: ModeEnum.TopUpBalance,
        operation_id: `test-op-${Date.now()}`,
      },
    }

    // Отправляем событие через тестовый движок
    logger.info('📤 Отправка события пополнения баланса', {
      description: 'Sending balance deposit event',
      event: depositEvent,
    })

    await inngestTestEngine.sendEvent(depositEvent.name, depositEvent.data)

    // Проверяем, что событие было добавлено в историю
    const events = inngestTestEngine.getEventsByName('payment/process')
    if (events.length === 0) {
      logger.error('❌ Событие payment/process не найдено в истории событий', {
        description: 'Event payment/process not found in event history',
      })
      return {
        success: false,
        name: 'Payment Inngest Events Test',
        message: 'Ошибка: событие payment/process не было добавлено в историю',
      }
    }

    // Проверяем, что данные события соответствуют отправленным
    const lastEvent = events[events.length - 1]

    if (
      lastEvent.data.telegram_id !== depositEvent.data.telegram_id ||
      lastEvent.data.amount !== depositEvent.data.amount ||
      lastEvent.data.type !== depositEvent.data.type
    ) {
      logger.error('❌ Данные события не соответствуют отправленным', {
        description: 'Event data does not match sent data',
        expected: depositEvent.data,
        actual: lastEvent.data,
      })
      return {
        success: false,
        name: 'Payment Inngest Events Test',
        message: 'Ошибка: данные события не соответствуют отправленным',
      }
    }

    // Создаем тестовое событие списания средств
    const expenseEvent = {
      name: 'payment/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
        amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT / 2, // Берем половину суммы для списания
        stars: TEST_CONFIG.TEST_DATA.TEST_STARS / 2,
        type: TransactionType.MONEY_EXPENSE,
        description: 'Тестовое списание средств через InngestTestEngine',
        bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
        service_type: ModeEnum.TextToVideo,
        operation_id: `test-op-${Date.now()}`,
      },
    }

    // Отправляем событие списания через тестовый движок
    logger.info('📤 Отправка события списания средств', {
      description: 'Sending expense event',
      event: expenseEvent,
    })

    await inngestTestEngine.sendEvent(expenseEvent.name, expenseEvent.data)

    // Проверяем, что второе событие также было добавлено в историю
    const allEvents = inngestTestEngine.getAllEvents()
    if (allEvents.length !== 2) {
      logger.error(
        '❌ Количество событий в истории не соответствует ожидаемому',
        {
          description: 'Number of events in history does not match expected',
          expected: 2,
          actual: allEvents.length,
        }
      )
      return {
        success: false,
        name: 'Payment Inngest Events Test',
        message: `Ошибка: ожидалось 2 события в истории, получено ${allEvents.length}`,
      }
    }

    // Проверяем, что оба события связаны с указанным telegram_id
    const userEvents = inngestTestEngine.getEventsForTelegramId(
      TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID
    )

    if (userEvents.length !== 2) {
      logger.error(
        '❌ Количество событий для пользователя не соответствует ожидаемому',
        {
          description: 'Number of events for user does not match expected',
          expected: 2,
          actual: userEvents.length,
        }
      )
      return {
        success: false,
        name: 'Payment Inngest Events Test',
        message: `Ошибка: ожидалось 2 события для пользователя, получено ${userEvents.length}`,
      }
    }

    // Выводим информацию о событиях для отладки
    inngestTestEngine.printEvents('События после выполнения теста:')

    logger.info('✅ Тест событий платежей успешно завершен', {
      description: 'Payment events test completed successfully',
    })

    return {
      success: true,
      name: 'Payment Inngest Events Test',
      message: 'Тест обработки событий платежей успешно пройден',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при выполнении теста событий платежей', {
      description: 'Error while executing payment events test',
      error: error.message,
      stack: error.stack,
    })

    return {
      success: false,
      name: 'Payment Inngest Events Test',
      message: `Ошибка при выполнении теста: ${error.message}`,
    }
  }
}

/**
 * Вспомогательная функция для запуска теста
 *
 * @returns {Promise<TestResult[]>} - Результаты выполнения тестов
 */
export async function runPaymentInngestTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов обработки платежей через Inngest', {
    description: 'Running payment processing tests through Inngest',
  })

  const results: TestResult[] = []

  // Выполняем основной тест
  const eventTestResult = await testPaymentInngestEvents()
  results.push(eventTestResult)

  // Выводим сводку результатов
  logger.info('📊 Сводка результатов тестов платежей через Inngest', {
    description: 'Payment Inngest tests summary',
    total: results.length,
    passed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  })

  return results
}
