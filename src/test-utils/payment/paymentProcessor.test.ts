import { inngest } from '../../core/inngest/clients'
import { logger } from '../../utils/logger'
import { supabase } from '../../core/supabase'
import { v4 as uuidv4 } from 'uuid'
import { TestResult } from '../types'

interface PaymentTestCase {
  name: string
  input: {
    telegram_id: string
    paymentAmount: number
    type: 'income' | 'outcome'
    description: string
    bot_name: string
    is_ru: boolean
    metadata?: Record<string, any>
  }
  expected: {
    success: boolean
    error?: string
  }
}

const TEST_CASES: PaymentTestCase[] = [
  {
    name: 'Успешное пополнение баланса',
    input: {
      telegram_id: '123456789',
      paymentAmount: 100,
      type: 'income',
      description: 'Тестовое пополнение',
      bot_name: 'test_bot',
      is_ru: true,
      metadata: {
        payment_method: 'Test',
        test_case: true,
      },
    },
    expected: {
      success: true,
    },
  },
  {
    name: 'Успешное списание средств',
    input: {
      telegram_id: '123456789',
      paymentAmount: 50,
      type: 'outcome',
      description: 'Тестовое списание',
      bot_name: 'test_bot',
      is_ru: true,
      metadata: {
        payment_method: 'Test',
        test_case: true,
      },
    },
    expected: {
      success: true,
    },
  },
  {
    name: 'Попытка списания при недостаточном балансе',
    input: {
      telegram_id: '987654321',
      paymentAmount: 1000,
      type: 'outcome',
      description: 'Тестовое списание с недостаточным балансом',
      bot_name: 'test_bot',
      is_ru: true,
      metadata: {
        payment_method: 'Test',
        test_case: true,
      },
    },
    expected: {
      success: false,
      error: 'Insufficient funds',
    },
  },
]

async function runPaymentTest(testCase: PaymentTestCase): Promise<TestResult> {
  const startTime = Date.now()
  const operationId = `test-${testCase.name}-${Date.now()}-${uuidv4()}`

  try {
    logger.info('🚀 Запуск теста платежа', {
      description: 'Starting payment test',
      testName: testCase.name,
      operationId,
    })

    // Отправляем событие в процессор платежей
    await inngest.send({
      id: operationId,
      name: 'payment/process',
      data: {
        ...testCase.input,
        metadata: {
          ...testCase.input.metadata,
          operation_id: operationId,
          test: true,
        },
      },
    })

    // Даем время на обработку платежа
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Проверяем результат в базе данных
    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('inv_id', operationId)
      .single()

    const duration = Date.now() - startTime

    if (!payment) {
      return {
        name: testCase.name,
        passed: false,
        success: false,
        error: 'Payment record not found',
        duration,
        testName: testCase.name,
        message: 'Платеж не был обработан',
        details: {
          operationId,
          input: testCase.input,
        },
      }
    }

    const success = payment.status === 'COMPLETED'
    const error = payment.error || undefined

    const passed =
      success === testCase.expected.success &&
      (!testCase.expected.error || error?.includes(testCase.expected.error))

    return {
      name: testCase.name,
      passed,
      success,
      error,
      duration,
      testName: testCase.name,
      message: passed ? 'Тест пройден успешно' : 'Тест не пройден',
      details: {
        operationId,
        payment,
        expected: testCase.expected,
      },
    }
  } catch (error) {
    const duration = Date.now() - startTime
    return {
      name: testCase.name,
      passed: false,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
      testName: testCase.name,
      message: 'Ошибка при выполнении теста',
      details: {
        operationId,
        input: testCase.input,
        error,
      },
    }
  }
}

export async function runPaymentTests(): Promise<TestResult[]> {
  logger.info('🧪 Запуск тестов платежной системы', {
    description: 'Starting payment system tests',
    numberOfTests: TEST_CASES.length,
  })

  const results: TestResult[] = []

  for (const testCase of TEST_CASES) {
    const result = await runPaymentTest(testCase)
    results.push(result)

    logger.info(result.passed ? '✅ Тест пройден' : '❌ Тест не пройден', {
      description: result.passed ? 'Test passed' : 'Test failed',
      testName: testCase.name,
      duration: result.duration,
      error: result.error,
    })
  }

  const passedTests = results.filter(r => r.passed).length
  const totalTests = results.length

  logger.info('📊 Результаты тестирования платежной системы', {
    description: 'Payment system test results',
    passedTests,
    totalTests,
    successRate: `${((passedTests / totalTests) * 100).toFixed(2)}%`,
  })

  return results
}
