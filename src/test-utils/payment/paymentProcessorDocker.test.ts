import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { v4 as uuidv4 } from 'uuid'
import { TestResult } from '../types'
import { TEST_CONFIG } from '../test-config'
import { TransactionType } from '@/interfaces/payments.interface'

interface DockerPaymentTestCase {
  name: string
  input: {
    telegram_id: string
    amount: number
    type: TransactionType.MONEY_INCOME | TransactionType.MONEY_EXPENSE
    description: string
    bot_name: string
    service_type?: string
    metadata?: Record<string, any>
  }
  expected: {
    success: boolean
    error?: string
  }
}

const DOCKER_TEST_CASES: DockerPaymentTestCase[] = [
  {
    name: 'Успешное пополнение баланса в Docker',
    input: {
      telegram_id: '123456789',
      amount: 100,
      type: TransactionType.MONEY_INCOME,
      description: 'Тестовое пополнение в Docker',
      bot_name: 'test_bot',
      service_type: 'TopUpBalance',
      metadata: {
        payment_method: 'Test',
        test_case: true,
        environment: 'docker',
      },
    },
    expected: {
      success: true,
    },
  },
  {
    name: 'Успешное списание средств в Docker',
    input: {
      telegram_id: '123456789',
      amount: 50,
      type: TransactionType.MONEY_EXPENSE,
      description: 'Тестовое списание в Docker',
      bot_name: 'test_bot',
      service_type: 'TextToImage',
      metadata: {
        payment_method: 'Test',
        test_case: true,
        environment: 'docker',
      },
    },
    expected: {
      success: true,
    },
  },
  {
    name: 'Попытка списания при недостаточном балансе в Docker',
    input: {
      telegram_id: '987654321',
      amount: 1000,
      type: TransactionType.MONEY_EXPENSE,
      description: 'Тестовое списание с недостаточным балансом в Docker',
      bot_name: 'test_bot',
      service_type: 'TextToImage',
      metadata: {
        payment_method: 'Test',
        test_case: true,
        environment: 'docker',
      },
    },
    expected: {
      success: false,
      error: 'Insufficient funds',
    },
  },
]

async function runDockerPaymentTest(
  testCase: DockerPaymentTestCase
): Promise<TestResult> {
  const startTime = Date.now()
  const operationId = `docker-test-${testCase.name}-${Date.now()}-${uuidv4()}`

  try {
    logger.info('🚀 Запуск теста платежа в Docker', {
      description: 'Starting Docker payment test',
      testName: testCase.name,
      operationId,
      environment: 'docker',
    })

    // Преобразование типа для соответствия ожидаемым значениям
    const paymentType =
      testCase.input.type === TransactionType.MONEY_INCOME
        ? TransactionType.MONEY_INCOME
        : TransactionType.MONEY_EXPENSE

    // Отправляем событие в процессор платежей
    await inngest.send({
      id: operationId,
      name: 'payment/process',
      data: {
        telegram_id: testCase.input.telegram_id,
        amount: testCase.input.amount,
        type: paymentType,
        description: testCase.input.description,
        bot_name: testCase.input.bot_name,
        service_type: testCase.input.service_type || 'Unknown',
        metadata: {
          ...testCase.input.metadata,
          operation_id: operationId,
          test: true,
          environment: 'docker',
        },
      },
    })

    // Даем время на обработку платежа
    await new Promise(resolve =>
      setTimeout(resolve, TEST_CONFIG.TIMEOUTS.MEDIUM)
    )

    // Проверяем результат в базе данных
    const { data: payment, error: queryError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('operation_id', operationId)
      .single()

    if (queryError) {
      logger.error('❌ Ошибка при запросе данных о платеже', {
        description: 'Error querying payment data',
        error: queryError.message,
        operationId,
      })

      return {
        name: testCase.name,
        success: false,
        message: `Ошибка при запросе данных о платеже: ${queryError.message}`,
        details: {
          operationId,
          error: queryError,
          testCase,
        },
      }
    }

    if (!payment) {
      return {
        name: testCase.name,
        success: false,
        message: 'Платеж не был обработан (запись не найдена)',
        details: {
          operationId,
          input: testCase.input,
        },
      }
    }

    const success = payment.status === 'COMPLETED'
    const error = payment.error_message || undefined

    const passed =
      success === testCase.expected.success &&
      (!testCase.expected.error ||
        (error && error.includes(testCase.expected.error)))

    const duration = Date.now() - startTime

    return {
      name: testCase.name,
      success: passed,
      message: passed
        ? `✅ Тест пройден успешно (${duration}ms)`
        : `❌ Тест не пройден: ожидался статус=${testCase.expected.success}, получен=${success}`,
      details: {
        operationId,
        payment,
        expected: testCase.expected,
        duration,
      },
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error('❌ Ошибка при выполнении теста платежа', {
      description: 'Error running payment test',
      error: errorMessage,
      operationId,
      testName: testCase.name,
    })

    return {
      name: testCase.name,
      success: false,
      message: `Ошибка при выполнении теста: ${errorMessage}`,
      details: {
        operationId,
        input: testCase.input,
        error,
        duration,
      },
    }
  }
}

export async function runDockerPaymentTests(): Promise<TestResult[]> {
  logger.info('🧪 Запуск тестов платежной системы в Docker', {
    description: 'Starting payment system tests in Docker',
    numberOfTests: DOCKER_TEST_CASES.length,
    environment: 'docker',
  })

  const results: TestResult[] = []

  for (const testCase of DOCKER_TEST_CASES) {
    const result = await runDockerPaymentTest(testCase)
    results.push(result)

    logger.info(result.success ? '✅ Тест пройден' : '❌ Тест не пройден', {
      description: result.success ? 'Test passed' : 'Test failed',
      testName: testCase.name,
      error: result.success ? undefined : result.message,
      environment: 'docker',
    })
  }

  const passedTests = results.filter(r => r.success).length
  const totalTests = results.length

  logger.info('📊 Результаты тестирования платежной системы в Docker', {
    description: 'Payment system test results in Docker',
    passedTests,
    totalTests,
    successRate: `${((passedTests / totalTests) * 100).toFixed(2)}%`,
    environment: 'docker',
  })

  return results
}
