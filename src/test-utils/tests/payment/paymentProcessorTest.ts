import { logger } from '@/utils/logger'
import assert from '@/test-utils/core/assert'
import { InngestFunctionTester } from '../../testers/InngestFunctionTester'
import { ModeEnum } from '@/types/modes'
import { v4 as uuidv4 } from 'uuid'

/**
 * Тестер для функции Payment Processor
 * Позволяет тестировать различные сценарии обработки платежей
 */
export class PaymentProcessorTester extends InngestFunctionTester<any, any> {
  constructor(options: any = {}) {
    super('payment-processor', {
      name: 'Payment Processor Test',
      ...options,
    })
  }

  /**
   * Тестирует успешную обработку пополнения баланса
   */
  async testSuccessfulBalanceTopUp(): Promise<any> {
    const telegram_id = '123456789'
    const amount = 100
    const bot_name = 'test_bot'

    logger.info('🧪 Тест успешного пополнения баланса', {
      description: 'Testing successful balance top-up',
      telegram_id,
      amount,
    })

    // Создаем данные для события
    const eventData = {
      telegram_id,
      amount,
      type: 'money_income',
      description: 'Пополнение баланса',
      bot_name,
      service_type: ModeEnum.TextToImage,
      stars: amount,
    }

    // Мокаем getUserBalance чтобы он возвращал предсказуемые значения
    this._mockGetUserBalance(telegram_id, 500)

    // Мокаем createSuccessfulPayment чтобы он просто возвращал данные
    this._mockCreateSuccessfulPayment()

    // Мокаем обновление баланса
    this._mockUpdateBalance()

    // Мокаем отправку уведомления
    this._mockSendNotification()

    // Отправляем событие payment/process
    const result = await this.sendEvent('payment/process', { data: eventData })

    // Проверяем успешность
    assert.equal(result.success, true)
    
    // Проверяем изменение баланса
    assert.equal(result.balanceChange.before, 500)
    assert.equal(result.balanceChange.after, 600)
    assert.equal(result.balanceChange.difference, 100)

    logger.info('✅ Тест успешного пополнения баланса завершен', {
      description: 'Successful balance top-up test completed',
      result,
    })

    return result
  }

  /**
   * Тестирует успешное списание средств с баланса
   */
  async testSuccessfulBalanceCharge(): Promise<any> {
    const telegram_id = '123456789'
    const amount = 50 // Списываемая сумма
    const bot_name = 'test_bot'
    const initialBalance = 200 // Начальный баланс

    logger.info('🧪 Тест успешного списания с баланса', {
      description: 'Testing successful balance charge',
      telegram_id,
      amount,
      initialBalance,
    })

    // Создаем данные для события
    const eventData = {
      telegram_id,
      amount,
      type: 'money_expense',
      description: 'Оплата услуги',
      bot_name,
      service_type: ModeEnum.TextToImage,
      stars: amount,
    }

    // Мокаем getUserBalance чтобы он возвращал предсказуемые значения
    this._mockGetUserBalance(telegram_id, initialBalance)

    // Мокаем createSuccessfulPayment чтобы он просто возвращал данные
    this._mockCreateSuccessfulPayment()

    // Мокаем обновление баланса
    this._mockUpdateBalance()

    // Мокаем отправку уведомления
    this._mockSendNotification()

    // Отправляем событие payment/process
    const result = await this.sendEvent('payment/process', { data: eventData })

    // Проверяем успешность
    assert.equal(result.success, true)
    
    // Проверяем изменение баланса
    assert.equal(result.balanceChange.before, initialBalance)
    assert.equal(result.balanceChange.after, initialBalance - amount)
    assert.equal(result.balanceChange.difference, -amount)

    logger.info('✅ Тест успешного списания с баланса завершен', {
      description: 'Successful balance charge test completed',
      result,
    })

    return result
  }

  /**
   * Тестирует ошибку при недостаточном балансе для списания
   */
  async testInsufficientFunds(): Promise<any> {
    const telegram_id = '123456789'
    const amount = 100 // Списываемая сумма
    const initialBalance = 50 // Недостаточный начальный баланс
    const bot_name = 'test_bot'

    logger.info('🧪 Тест недостаточного баланса', {
      description: 'Testing insufficient funds',
      telegram_id,
      amount,
      initialBalance,
    })

    // Создаем данные для события
    const eventData = {
      telegram_id,
      amount,
      type: 'money_expense',
      description: 'Оплата услуги',
      bot_name,
      service_type: ModeEnum.TextToImage,
    }

    // Мокаем getUserBalance чтобы он возвращал предсказуемые значения
    this._mockGetUserBalance(telegram_id, initialBalance)

    try {
      // Отправляем событие payment/process
      await this.sendEvent('payment/process', { data: eventData })
      
      // Если мы здесь, значит ошибки не было, что неправильно
      assert.fail('Должна была возникнуть ошибка из-за недостаточного баланса')
      return { success: false }
    } catch (error) {
      // Проверяем, что ошибка соответствует ожидаемой
      const errorMessage = error instanceof Error ? error.message : String(error)
      assert.isTrue(
        errorMessage.includes('Недостаточно средств') || 
        errorMessage.includes('insufficient funds'),
        `Ожидалась ошибка о недостаточных средствах, получено: ${errorMessage}`
      )

      logger.info('✅ Тест недостаточного баланса завершен', {
        description: 'Insufficient funds test completed successfully',
        errorMessage,
      })

      return { 
        success: true, 
        errorCaught: true,
        errorMessage 
      }
    }
  }

  /**
   * Тестирует ошибку при отрицательной сумме платежа
   */
  async testNegativeAmount(): Promise<any> {
    const telegram_id = '123456789'
    const amount = -50 // Отрицательная сумма
    const bot_name = 'test_bot'

    logger.info('🧪 Тест отрицательной суммы платежа', {
      description: 'Testing negative payment amount',
      telegram_id,
      amount,
    })

    // Создаем данные для события
    const eventData = {
      telegram_id,
      amount,
      type: 'money_income',
      description: 'Пополнение баланса с отрицательной суммой',
      bot_name,
      service_type: ModeEnum.TextToImage,
    }

    try {
      // Отправляем событие payment/process
      await this.sendEvent('payment/process', { data: eventData })
      
      // Если мы здесь, значит ошибки не было, что неправильно
      assert.fail('Должна была возникнуть ошибка из-за отрицательной суммы')
      return { success: false }
    } catch (error) {
      // Проверяем, что ошибка соответствует ожидаемой
      const errorMessage = error instanceof Error ? error.message : String(error)
      assert.isTrue(
        errorMessage.includes('Некорректная сумма') || 
        errorMessage.includes('должна быть положительной') ||
        errorMessage.includes('Invalid amount'),
        `Ожидалась ошибка о некорректной сумме, получено: ${errorMessage}`
      )

      logger.info('✅ Тест отрицательной суммы платежа завершен', {
        description: 'Negative payment amount test completed successfully',
        errorMessage,
      })

      return { 
        success: true, 
        errorCaught: true,
        errorMessage 
      }
    }
  }

  /**
   * Запуск всех тестов для Payment Processor
   */
  async runAllTests(): Promise<any[]> {
    logger.info('🚀 Запуск всех тестов Payment Processor', {
      description: 'Running all Payment Processor tests',
    })

    const results = []

    try {
      const topUpResult = await this.testSuccessfulBalanceTopUp()
      results.push({
        name: 'Успешное пополнение баланса',
        success: topUpResult.success,
        result: topUpResult,
      })
    } catch (error) {
      results.push({
        name: 'Успешное пополнение баланса',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      const chargeResult = await this.testSuccessfulBalanceCharge()
      results.push({
        name: 'Успешное списание с баланса',
        success: chargeResult.success,
        result: chargeResult,
      })
    } catch (error) {
      results.push({
        name: 'Успешное списание с баланса',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      const insufficientResult = await this.testInsufficientFunds()
      results.push({
        name: 'Обработка недостаточного баланса',
        success: insufficientResult.success && insufficientResult.errorCaught,
        result: insufficientResult,
      })
    } catch (error) {
      results.push({
        name: 'Обработка недостаточного баланса',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      const negativeResult = await this.testNegativeAmount()
      results.push({
        name: 'Обработка отрицательной суммы',
        success: negativeResult.success && negativeResult.errorCaught,
        result: negativeResult,
      })
    } catch (error) {
      results.push({
        name: 'Обработка отрицательной суммы',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    const successCount = results.filter(r => r.success).length
    const totalCount = results.length

    logger.info('✅ Все тесты Payment Processor выполнены', {
      description: 'All Payment Processor tests completed',
      successCount,
      totalCount,
    })

    return results
  }

  /**
   * Выполняет тестирование Payment Processor
   */
  async executeTest(method?: string): Promise<any> {
    logger.info('🧪 Выполнение тестов Payment Processor', {
      description: 'Executing Payment Processor tests',
      method: method || 'all',
    })

    const startTime = Date.now()

    try {
      let result

      if (!method || method === 'all') {
        result = await this.runAllTests()
      } else if (method === 'topUp') {
        result = await this.testSuccessfulBalanceTopUp()
      } else if (method === 'charge') {
        result = await this.testSuccessfulBalanceCharge()
      } else if (method === 'insufficient') {
        result = await this.testInsufficientFunds()
      } else if (method === 'negative') {
        result = await this.testNegativeAmount()
      } else {
        throw new Error(`Неизвестный метод: ${method}`)
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      logger.info('✅ Тесты Payment Processor успешно выполнены', {
        description: 'Payment Processor tests successfully completed',
        duration,
        method: method || 'all',
      })

      return result
    } catch (error) {
      const endTime = Date.now()
      const duration = endTime - startTime

      logger.error('❌ Ошибка при выполнении тестов Payment Processor', {
        description: 'Error executing Payment Processor tests',
        error: error instanceof Error ? error.message : String(error),
        duration,
        method: method || 'all',
      })

      throw error
    }
  }

  // Вспомогательные методы для мокирования

  private _mockGetUserBalance(telegram_id: string, initialBalance: number): void {
    this.mockFunction('@/core/supabase/getUserBalance', async (tid: string) => {
      // Проверяем, что функция вызвана с правильными параметрами
      assert.equal(tid, telegram_id)
      return initialBalance
    })
  }

  private _mockCreateSuccessfulPayment(): void {
    this.mockFunction('@/core/supabase/createSuccessfulPayment', async (params: any) => {
      // Просто возвращаем данные, которые были переданы
      return {
        id: uuidv4(),
        created_at: new Date().toISOString(),
        ...params,
      }
    })
  }

  private _mockUpdateBalance(): void {
    this.mockFunction('supabase.from', () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({ error: null })
        })
      })
    }))
  }

  private _mockSendNotification(): void {
    this.mockFunction('@/helpers/sendTransactionNotification', async () => {
      return { success: true }
    })
  }
}

/**
 * Запускает тесты для Payment Processor
 */
export async function runPaymentProcessorTests(options: { verbose?: boolean } = {}): Promise<any> {
  const tester = new PaymentProcessorTester({
    verbose: options.verbose,
  })

  logger.info('🚀 Запуск тестов Payment Processor...', {
    description: 'Starting Payment Processor Tests...',
  })

  try {
    const results = await tester.executeTest()
    
    return {
      success: true,
      results,
    }
  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов Payment Processor', {
      error: error instanceof Error ? error.message : String(error),
    })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
} 