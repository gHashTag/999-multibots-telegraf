import { logger } from '@/utils/logger'
import { TEST_CONFIG, inngestTestEngine } from '../../test-config'
import { TestResult } from '../../types'
import { ModeEnum } from './price/types/modes'

/**
 * Модуль содержит тесты для функции обработки платежей (paymentProcessor)
 *
 * Тесты проверяют:
 * 1. Обработку операций пополнения баланса
 * 2. Обработку операций списания средств
 * 3. Обработку платежей с использованием моков
 *
 * Для запуска используйте:
 * - npm run test:payment
 * - npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --category=payment
 *
 * @module src/test-utils/tests/payment/paymentProcessorTest
 */

/**
 * Тест функции обработки платежей
 *
 * @returns {Promise<TestResult>} - Результат теста
 */
export async function testPaymentProcessor(): Promise<TestResult> {
  console.log('🚀 [TEST]: Запуск теста обработки платежей')

  try {
    // Очищаем историю событий перед началом теста
    inngestTestEngine.clearEvents()

    // 1. Тест положительного пополнения баланса
    console.log('🔍 [TEST]: Проверка положительного пополнения баланса')
    const positiveResult = await testPositivePayment()
    if (!positiveResult.success) {
      return {
        success: false,
        name: 'Payment Processor Test',
        message: `Ошибка при тестировании положительного платежа: ${positiveResult.message}`,
      }
    }

    // 2. Тест с отрицательной суммой (должен выдать ошибку)
    console.log('🔍 [TEST]: Проверка обработки отрицательной суммы платежа')
    const negativeResult = await testNegativePayment()
    if (!negativeResult.success) {
      return {
        success: false,
        name: 'Payment Processor Test',
        message: `Ошибка при тестировании отрицательного платежа: ${negativeResult.message}`,
      }
    }

    // 3. Тест с недостаточными данными (должен выдать ошибку)
    console.log(
      '🔍 [TEST]: Проверка обработки платежа с недостаточными данными'
    )
    const invalidDataResult = await testInvalidPaymentData()
    if (!invalidDataResult.success) {
      return {
        success: false,
        name: 'Payment Processor Test',
        message: `Ошибка при тестировании неполных данных платежа: ${invalidDataResult.message}`,
      }
    }

    // Тест успешно завершен, если все подтесты прошли
    return {
      success: true,
      name: 'Payment Processor Test',
      message: 'Все тесты обработки платежей успешно пройдены',
    }
  } catch (error: any) {
    console.error(
      '❌ [TEST_ERROR]: Необработанная ошибка в тесте платежного процессора:',
      error
    )
    return {
      success: false,
      name: 'Payment Processor Test',
      message: `Произошла непредвиденная ошибка: ${error.message}`,
    }
  }
}

/**
 * Тест обработки положительного платежа
 *
 * @returns {Promise<TestResult>} - Результат теста
 */
async function testPositivePayment(): Promise<TestResult> {
  try {
    // Подготавливаем тестовые данные
    const paymentData = {
      telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT,
      stars: TEST_CONFIG.TEST_DATA.TEST_STARS,
      type: TransactionType.MONEY_INCOME,
      description: 'Тестовое пополнение баланса',
      bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
      service_type: ModeEnum.TopUpBalance,
    }

    // Вызываем функцию отправки события
    const result = await inngestTestEngine.sendEvent(
      'payment/process',
      paymentData
    )

    // Проверяем, что событие было успешно отправлено
    if (!result) {
      return {
        success: false,
        name: 'Positive Payment Test',
        message: 'Не удалось отправить событие платежа',
      }
    }

    // Проверяем, что событие было добавлено в историю
    const events = inngestTestEngine.getEventsByName('payment/process')
    if (events.length === 0) {
      return {
        success: false,
        name: 'Positive Payment Test',
        message: 'Событие платежа не было добавлено в историю событий',
      }
    }

    // Проверяем, что данные события соответствуют отправленным
    const lastEvent = events[events.length - 1]
    if (
      lastEvent.data.telegram_id !== paymentData.telegram_id ||
      lastEvent.data.amount !== paymentData.amount ||
      lastEvent.data.type !== paymentData.type
    ) {
      return {
        success: false,
        name: 'Positive Payment Test',
        message: 'Данные события не соответствуют отправленным',
      }
    }

    console.log('✅ [TEST]: Тест положительного платежа успешно пройден')
    return {
      success: true,
      name: 'Positive Payment Test',
      message: 'Тест положительного платежа успешно пройден',
    }
  } catch (error: any) {
    console.error(
      '❌ [TEST_ERROR]: Ошибка в тесте положительного платежа:',
      error
    )
    return {
      success: false,
      name: 'Positive Payment Test',
      message: `Ошибка при тестировании положительного платежа: ${error.message}`,
    }
  }
}

/**
 * Тест обработки отрицательного платежа (должен выдать ошибку)
 *
 * @returns {Promise<TestResult>} - Результат теста
 */
async function testNegativePayment(): Promise<TestResult> {
  try {
    // Подготавливаем тестовые данные с отрицательной суммой
    const paymentData = {
      telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      amount: -TEST_CONFIG.TEST_DATA.TEST_AMOUNT, // Отрицательная сумма
      stars: TEST_CONFIG.TEST_DATA.TEST_STARS,
      type: TransactionType.MONEY_INCOME,
      description: 'Тестовое пополнение с отрицательной суммой',
      bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
      service_type: ModeEnum.TopUpBalance,
    }

    // Ожидаем, что вызов функции вызовет ошибку
    try {
      await inngestTestEngine.sendEvent('payment/process', paymentData)

      // Если функция не выбросила исключение, тест провален
      console.error(
        '❌ [TEST_ERROR]: Отрицательная сумма платежа не вызвала ошибку'
      )
      return {
        success: false,
        name: 'Negative Payment Test',
        message: 'Отрицательная сумма платежа должна вызывать ошибку',
      }
    } catch (error: any) {
      // Ожидаемая ошибка - это успешный результат теста
      if (error.message.includes('Сумма платежа должна быть положительной')) {
        console.log(
          '✅ [TEST]: Тест отрицательного платежа успешно пройден, получена ожидаемая ошибка'
        )
        return {
          success: true,
          name: 'Negative Payment Test',
          message:
            'Тест отрицательного платежа успешно пройден, получена ожидаемая ошибка',
        }
      } else {
        // Если ошибка не соответствует ожидаемой, тест провален
        console.error(
          '❌ [TEST_ERROR]: Некорректная ошибка в тесте отрицательного платежа:',
          error
        )
        return {
          success: false,
          name: 'Negative Payment Test',
          message: `Получена неожиданная ошибка: ${error.message}`,
        }
      }
    }
  } catch (error: any) {
    console.error(
      '❌ [TEST_ERROR]: Необработанная ошибка в тесте отрицательного платежа:',
      error
    )
    return {
      success: false,
      name: 'Negative Payment Test',
      message: `Произошла непредвиденная ошибка: ${error.message}`,
    }
  }
}

/**
 * Тест обработки платежа с недостаточными данными (должен выдать ошибку)
 *
 * @returns {Promise<TestResult>} - Результат теста
 */
async function testInvalidPaymentData(): Promise<TestResult> {
  try {
    // Подготавливаем неполные данные о платеже (отсутствует telegram_id)
    const paymentData = {
      // telegram_id отсутствует
      amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT,
      stars: TEST_CONFIG.TEST_DATA.TEST_STARS,
      type: TransactionType.MONEY_INCOME,
      description: 'Тестовое пополнение с неполными данными',
      bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
      service_type: ModeEnum.TopUpBalance,
    }

    // Ожидаем, что вызов функции вызовет ошибку
    try {
      await inngestTestEngine.sendEvent('payment/process', paymentData)

      // Если функция не выбросила исключение, тест провален
      console.error(
        '❌ [TEST_ERROR]: Неполные данные платежа не вызвали ошибку'
      )
      return {
        success: false,
        name: 'Invalid Data Payment Test',
        message: 'Неполные данные платежа должны вызывать ошибку',
      }
    } catch (error: any) {
      // Ожидаемая ошибка - это успешный результат теста
      if (error.message.includes('Отсутствует обязательное поле telegram_id')) {
        console.log(
          '✅ [TEST]: Тест неполных данных платежа успешно пройден, получена ожидаемая ошибка'
        )
        return {
          success: true,
          name: 'Invalid Data Payment Test',
          message:
            'Тест неполных данных платежа успешно пройден, получена ожидаемая ошибка',
        }
      } else {
        // Если ошибка не соответствует ожидаемой, тест провален
        console.error(
          '❌ [TEST_ERROR]: Некорректная ошибка в тесте неполных данных платежа:',
          error
        )
        return {
          success: false,
          name: 'Invalid Data Payment Test',
          message: `Получена неожиданная ошибка: ${error.message}`,
        }
      }
    }
  } catch (error: any) {
    console.error(
      '❌ [TEST_ERROR]: Необработанная ошибка в тесте неполных данных платежа:',
      error
    )
    return {
      success: false,
      name: 'Invalid Data Payment Test',
      message: `Произошла непредвиденная ошибка: ${error.message}`,
    }
  }
}

/**
 * Запускает все тесты платежного процессора
 * @param options Опции запуска тестов
 * @returns Массив результатов тестов
 */
export async function runPaymentProcessorTests(
  options: { verbose?: boolean } = {}
): Promise<TestResult[]> {
  const startTime = Date.now()
  const results: TestResult[] = []

  logger.info('🚀 Запуск тестов платежного процессора', {
    description: 'Starting payment processor tests',
    verbose: options.verbose,
  })

  try {
    // Тест пополнения баланса
    const incomeResult = await testPaymentProcessor()
    results.push(incomeResult)

    // Собираем статистику
    const duration = Date.now() - startTime
    const successfulTests = results.filter(r => r.success).length
    const totalTests = results.length

    logger.info('✅ Тесты платежного процессора завершены', {
      description: 'Payment processor tests completed',
      duration,
      successful: successfulTests,
      total: totalTests,
      success_rate: `${Math.round((successfulTests / totalTests) * 100)}%`,
    })

    return results
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error('❌ Ошибка при запуске тестов платежного процессора', {
      description: 'Error running payment processor tests',
      error: errorMessage,
      duration,
    })

    // Возвращаем результат с ошибкой
    return [
      {
        success: false,
        name: 'Тесты платежного процессора',
        message: `Ошибка при запуске тестов: ${errorMessage}`,
      },
    ]
  }
}
