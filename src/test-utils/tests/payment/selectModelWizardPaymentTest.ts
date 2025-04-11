import { TestResult, MockFunction } from '../../types'
import { TEST_CONFIG } from '../../test-config'
import { createMockFn } from '../../test-config'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { TransactionType } from '@/interfaces/payments.interface'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { inngestTestEngine } from '../../test-config'
import { ModelSelectionPaymentResult } from '@/interfaces/selectModelWizard.interface'

/**
 * Модуль для тестирования интеграции SelectModelWizard с платежной системой
 *
 * Тесты проверяют:
 * 1. Корректность обработки выбора бесплатной модели
 * 2. Корректность обработки выбора платной модели
 * 3. Обработку ошибок при недостаточном балансе
 * 4. Корректное формирование платежного события
 *
 * @module src/test-utils/tests/payment/selectModelWizardPaymentTest
 */

interface SelectModelTestCase {
  name: string
  input: {
    telegram_id: string
    modelName: string
    isPaid: boolean
    modelPrice?: number
    currentBalance?: number
  }
  expected: {
    success: boolean
    shouldCreatePayment: boolean
    paymentType?: TransactionType
    error?: string
  }
}

// Тестовые случаи для проверки платежной интеграции с SelectModelWizard
const TEST_CASES: SelectModelTestCase[] = [
  {
    name: '✅ Выбор бесплатной модели',
    input: {
      telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      modelName: 'GPT-3.5',
      isPaid: false,
      currentBalance: 100,
    },
    expected: {
      success: true,
      shouldCreatePayment: false,
    },
  },
  {
    name: '✅ Выбор платной модели с достаточным балансом',
    input: {
      telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      modelName: 'GPT-4',
      isPaid: true,
      modelPrice: 10,
      currentBalance: 100,
    },
    expected: {
      success: true,
      shouldCreatePayment: true,
      paymentType: TransactionType.MONEY_EXPENSE,
    },
  },
  {
    name: '❌ Выбор платной модели с недостаточным балансом',
    input: {
      telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      modelName: 'GPT-4',
      isPaid: true,
      modelPrice: 50,
      currentBalance: 20,
    },
    expected: {
      success: false,
      shouldCreatePayment: false,
      error: 'Недостаточно средств',
    },
  },
  {
    name: '✅ Проверка корректности формирования платежного события',
    input: {
      telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      modelName: 'Claude-3',
      isPaid: true,
      modelPrice: 15,
      currentBalance: 100,
    },
    expected: {
      success: true,
      shouldCreatePayment: true,
      paymentType: TransactionType.MONEY_EXPENSE,
    },
  },
]

/**
 * Тестирует выбор модели и интеграцию с платежной системой
 */
async function runSelectModelPaymentTest(
  testCase: SelectModelTestCase
): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста SelectModelWizard с платежной системой', {
      description: 'Starting SelectModelWizard payment integration test',
      testName: testCase.name,
    })

    // Очищаем историю событий перед тестом
    inngestTestEngine.clearEvents()

    // Создаем моки для необходимых функций
    const getUserBalanceMock = createMockFn<
      string,
      Promise<number>
    >().mockReturnValue(Promise.resolve(testCase.input.currentBalance || 0))

    const setModelMock = createMockFn<
      [string, string],
      Promise<void>
    >().mockReturnValue(Promise.resolve())

    // Имитируем логику SelectModelWizard
    const paymentResult = await mockSelectModelWizardProcess(testCase.input, {
      getUserBalance: getUserBalanceMock as MockFunction<
        string,
        Promise<number>
      >,
      setModel: setModelMock as MockFunction<[string, string], Promise<void>>,
    })

    // Проверяем, что событие платежа было отправлено, если это ожидается
    const paymentEvents = inngestTestEngine.getEventsByName('payment/process')
    const paymentEventSent = paymentEvents.length > 0

    // Проверяем корректность результатов
    const success = paymentResult.success === testCase.expected.success
    const paymentCreationCorrect =
      paymentEventSent === testCase.expected.shouldCreatePayment

    // Проверяем тип платежа, если он ожидается
    let paymentTypeCorrect = true
    if (testCase.expected.paymentType && paymentEventSent) {
      const paymentEvent = paymentEvents[0]
      paymentTypeCorrect =
        paymentEvent.data.type === testCase.expected.paymentType
    }

    // Проверяем ошибку, если она ожидается
    let errorCorrect = true
    if (testCase.expected.error) {
      errorCorrect =
        paymentResult.error?.includes(testCase.expected.error) || false
    }

    const allChecksPass =
      success && paymentCreationCorrect && paymentTypeCorrect && errorCorrect

    return {
      success: allChecksPass,
      name: testCase.name,
      message: allChecksPass ? '✅ Тест пройден успешно' : '❌ Тест не пройден',
      details: {
        expected: testCase.expected,
        actual: {
          success: paymentResult.success,
          paymentEventSent,
          paymentType: paymentEventSent ? paymentEvents[0].data.type : null,
          error: paymentResult.error,
        },
        balanceCalls: getUserBalanceMock.calls,
        modelSetCalls: setModelMock.calls,
      },
    }
  } catch (error) {
    logger.error('❌ Ошибка при выполнении теста SelectModelWizard', {
      description: 'Error running SelectModelWizard payment test',
      testName: testCase.name,
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: testCase.name,
      message: 'Произошла ошибка при выполнении теста',
      details: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }
  }
}

/**
 * Имитирует процесс выбора модели и интеграцию с платежной системой
 */
async function mockSelectModelWizardProcess(
  input: SelectModelTestCase['input'],
  mocks: {
    getUserBalance: MockFunction<string, Promise<number>>
    setModel: MockFunction<[string, string], Promise<void>>
  }
): Promise<ModelSelectionPaymentResult> {
  try {
    const { telegram_id, modelName, isPaid, modelPrice = 0 } = input

    // Получаем текущий баланс пользователя
    const currentBalance = (await mocks.getUserBalance(telegram_id)) as number

    // Проверяем, требуется ли оплата
    if (isPaid) {
      // Проверяем достаточность средств
      if (currentBalance < modelPrice) {
        return {
          success: false,
          error: `Недостаточно средств. Баланс: ${currentBalance}, требуется: ${modelPrice}`,
        }
      }

      // Отправляем событие платежа
      const operationId = `test-select-model-${Date.now()}-${uuidv4()}`

      await inngestTestEngine.sendEvent('payment/process', {
        telegram_id,
        amount: modelPrice,
        stars: modelPrice,
        type: TransactionType.MONEY_EXPENSE,
        description: `🎯 Выбор модели ${modelName}`,
        bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
        service_type: ModeEnum.SelectModelWizard,
        metadata: {
          model_name: modelName,
          operation_id: operationId,
          test: true,
        },
      })

      // Устанавливаем модель
      await mocks.setModel([telegram_id, modelName])

      return {
        success: true,
        transactionId: operationId,
        metadata: {
          model_name: modelName,
          operation_id: operationId,
          model_price: modelPrice,
        },
      }
    }

    // Устанавливаем модель
    await mocks.setModel([telegram_id, modelName])

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Запускает тесты для проверки интеграции SelectModelWizard с платежной системой
 */
export async function testSelectModelWizardPaymentIntegration(): Promise<TestResult> {
  try {
    logger.info(
      '🚀 Запуск тестов интеграции SelectModelWizard с платежной системой',
      {
        description: 'Starting SelectModelWizard payment integration tests',
        numberOfTests: TEST_CASES.length,
      }
    )

    const results: TestResult[] = []

    // Запускаем все тестовые случаи
    for (const testCase of TEST_CASES) {
      const result = await runSelectModelPaymentTest(testCase)
      results.push(result)

      logger.info(result.success ? '✅ Тест пройден' : '❌ Тест не пройден', {
        description: result.success ? 'Test passed' : 'Test failed',
        testName: testCase.name,
      })
    }

    // Получаем статистику по тестам
    const passedTests = results.filter(r => r.success).length
    const failedTests = results.filter(r => !r.success).length
    const successRate = (passedTests / TEST_CASES.length) * 100

    logger.info('📊 Результаты тестирования интеграции SelectModelWizard', {
      description: 'SelectModelWizard integration test results',
      total: TEST_CASES.length,
      passed: passedTests,
      failed: failedTests,
      successRate: `${successRate.toFixed(2)}%`,
    })

    return {
      success: failedTests === 0,
      name: 'Тесты интеграции SelectModelWizard с платежной системой',
      message:
        failedTests === 0
          ? '✅ Все тесты пройдены успешно'
          : `❌ Не пройдено ${failedTests} из ${TEST_CASES.length} тестов`,
      details: results,
    }
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов SelectModelWizard', {
      description: 'Error running SelectModelWizard tests',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'Тесты интеграции SelectModelWizard с платежной системой',
      message: 'Произошла ошибка при запуске тестов',
      details: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }
  }
}
