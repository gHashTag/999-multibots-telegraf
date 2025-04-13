import { logger } from '@/utils/logger'
import { inngestTestEngine, TEST_CONFIG } from '../../test-config'
import { TestResult } from '../../types'
import { ModeEnum } from '@/interfaces/modes'
import { TransactionType, PaymentStatus } from '@/interfaces/payments.interface'
import { InngestTestEngine } from '@inngest/test'
import { paymentProcessorFunction } from '@/inngest-functions/paymentProcessor'
import { createMockFn } from '../../test-config'

/**
 * Модуль содержит расширенные тесты для использования Inngest в процессе обработки платежей
 *
 * @module src/test-utils/tests/payment/paymentAdvancedInngestTest
 */

/**
 * Создает тестовый движок Inngest с настроенными обработчиками событий
 *
 * @returns {InngestTestEngine} - Настроенный тестовый движок Inngest
 */
function createAdvancedTestEngine() {
  // Создаем новый экземпляр тестового движка
  const testEngine = new InngestTestEngine({
    function: paymentProcessorFunction,
    steps: [
      {
        id: 'validate-payment-data',
        handler: async (ctx: any) => {
          const { event } = ctx
          logger.info('🔍 Валидация данных платежа', {
            description: 'Validating payment data',
            data: event.data,
          })

          // Проверяем обязательные поля
          if (!event.data.telegram_id) {
            throw new Error('Missing telegram_id')
          }

          if (!event.data.amount && event.data.amount !== 0) {
            throw new Error('Missing amount')
          }

          if (event.data.amount < 0) {
            throw new Error('Amount must be positive')
          }

          return { valid: true }
        },
      },
      {
        id: 'process-payment',
        handler: async (ctx: any) => {
          const { event } = ctx
          logger.info('💳 Обработка платежа', {
            description: 'Processing payment',
            data: event.data,
          })

          // Имитируем обработку платежа
          await new Promise(resolve => setTimeout(resolve, 100))

          return {
            status: PaymentStatus.COMPLETED,
            telegram_id: event.data.telegram_id,
            amount: event.data.amount,
            stars: event.data.stars || event.data.amount,
            type: event.data.type,
            payment_id: `test-${Date.now()}`,
          }
        },
      },
      {
        id: 'update-user-balance',
        handler: async (ctx: any) => {
          const { event, step } = ctx
          const paymentResult = await step.run(
            'process-payment',
            () => ctx.step.data
          )

          logger.info('💰 Обновление баланса пользователя', {
            description: 'Updating user balance',
            telegram_id: event.data.telegram_id,
            amount: event.data.amount,
            type: event.data.type,
          })

          // Имитируем обновление баланса
          return {
            success: true,
            telegram_id: event.data.telegram_id,
            previous_balance: 100, // Тестовый предыдущий баланс
            new_balance:
              event.data.type === TransactionType.MONEY_INCOME
                ? 100 + event.data.stars
                : 100 - event.data.stars,
            payment: paymentResult,
          }
        },
      },
      {
        id: 'send-notification',
        handler: async (ctx: any) => {
          const { event } = ctx
          logger.info('📣 Отправка уведомления о платеже', {
            description: 'Sending payment notification',
            telegram_id: event.data.telegram_id,
            type: event.data.type,
          })

          // Имитируем отправку уведомления
          return {
            notification_sent: true,
            telegram_id: event.data.telegram_id,
            message: `Платеж ${event.data.type === TransactionType.MONEY_INCOME ? 'зачислен' : 'списан'}: ${event.data.stars} звезд`,
          }
        },
      },
    ],
  })

  return testEngine
}

/**
 * Расширенный тест для Inngest с использованием цепочек событий
 *
 * @returns {Promise<TestResult>} - Результат выполнения теста
 */
export async function testAdvancedInngestPaymentFlow(): Promise<TestResult> {
  try {
    logger.info(
      '🚀 Запуск расширенного теста обработки платежей через Inngest',
      {
        description: 'Starting advanced payment processing test with Inngest',
      }
    )

    // Создаем тестовый движок
    const testEngine = createAdvancedTestEngine()

    // Мокаем supabase клиент
    const mockSupabase = {
      from: createMockFn().mockReturnValue({
        select: createMockFn().mockReturnValue({
          eq: createMockFn().mockReturnValue({
            single: createMockFn().mockReturnValue({
              data: { balance: 100 },
              error: null,
            }),
          }),
        }),
        insert: createMockFn().mockReturnValue({
          select: createMockFn().mockReturnValue({
            single: createMockFn().mockReturnValue({
              data: { id: 'test-payment-id' },
              error: null,
            }),
          }),
        }),
        update: createMockFn().mockReturnValue({
          eq: createMockFn().mockReturnValue({
            single: createMockFn().mockReturnValue({
              data: { balance: 200 },
              error: null,
            }),
          }),
        }),
      }),
    }

    // Создаем тестовые события платежей
    const testEvents = [
      // Событие пополнения баланса
      {
        name: 'payment/process',
        data: {
          telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
          amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT,
          stars: TEST_CONFIG.TEST_DATA.TEST_STARS,
          type: TransactionType.MONEY_INCOME,
          description: 'Тестовое пополнение баланса',
          bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
          service_type: ModeEnum.TopUpBalance,
          operation_id: `test-deposit-${Date.now()}`,
        },
      },
      // Событие расхода средств
      {
        name: 'payment/process',
        data: {
          telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
          amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT / 2,
          stars: TEST_CONFIG.TEST_DATA.TEST_STARS / 2,
          type: TransactionType.MONEY_EXPENSE,
          description: 'Тестовое списание средств',
          bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
          service_type: ModeEnum.TextToVideo,
          operation_id: `test-expense-${Date.now()}`,
        },
      },
    ]

    // Выполняем последовательность событий
    const results = []
    for (const event of testEvents) {
      logger.info(`📤 Выполнение события ${event.name}`, {
        description: `Executing event ${event.name}`,
        event_data: event.data,
      })

      const result = await testEngine.execute({
        events: [event],
      })

      results.push(result)

      logger.info('✅ Событие обработано', {
        description: 'Event processed',
        event_name: event.name,
        success: !!result.result,
        steps_completed: result.steps?.filter(s => !s.error).length || 0,
        steps_failed: result.steps?.filter(s => s.error).length || 0,
      })
    }

    // Проверяем результаты выполнения
    const allStepsCompleted = results.every(
      r => r.steps && r.steps.every(step => !step.error)
    )

    if (!allStepsCompleted) {
      logger.error('❌ Не все шаги были успешно выполнены', {
        description: 'Not all steps completed successfully',
      })

      // Выводим информацию о неудачных шагах
      results.forEach((result, index) => {
        const failedSteps = result.steps?.filter(s => s.error) || []
        if (failedSteps.length > 0) {
          logger.error(`❌ Событие #${index + 1} содержит ошибки:`, {
            description: `Event #${index + 1} has errors`,
            event_name: testEvents[index].name,
            failed_steps: failedSteps.map(s => ({
              id: s.id,
              error: s.error,
            })),
          })
        }
      })

      return {
        success: false,
        name: 'Advanced Inngest Payment Test',
        message: 'Не все шаги в цепочке событий были успешно выполнены',
      }
    }

    // Проверяем результаты обработки каждого события
    const depositResult = results[0].result
    const expenseResult = results[1].result

    if (!depositResult || !expenseResult) {
      logger.error('❌ Отсутствуют результаты обработки событий', {
        description: 'Missing event processing results',
        deposit_result: !!depositResult,
        expense_result: !!expenseResult,
      })

      return {
        success: false,
        name: 'Advanced Inngest Payment Test',
        message:
          'Отсутствуют результаты обработки одного или нескольких событий',
      }
    }

    logger.info('✅ Расширенный тест обработки платежей успешно завершен', {
      description: 'Advanced payment test completed successfully',
      deposit_result: depositResult,
      expense_result: expenseResult,
    })

    return {
      success: true,
      name: 'Advanced Inngest Payment Test',
      message: 'Расширенный тест обработки платежей успешно завершен',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при выполнении расширенного теста платежей', {
      description: 'Error while executing advanced payment test',
      error: error.message,
      stack: error.stack,
    })

    return {
      success: false,
      name: 'Advanced Inngest Payment Test',
      message: `Ошибка при выполнении теста: ${error.message}`,
    }
  }
}

/**
 * Функция для запуска расширенных тестов платежей через Inngest
 *
 * @returns {Promise<TestResult[]>} - Результаты выполнения тестов
 */
export async function runAdvancedPaymentInngestTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск расширенных тестов обработки платежей через Inngest', {
    description: 'Running advanced payment tests with Inngest',
  })

  const results: TestResult[] = []

  // Выполняем расширенный тест
  const testResult = await testAdvancedInngestPaymentFlow()
  results.push(testResult)

  // Выводим сводку результатов
  logger.info('📊 Сводка результатов расширенных тестов платежей', {
    description: 'Advanced payment tests summary',
    total: results.length,
    passed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  })

  return results
}
