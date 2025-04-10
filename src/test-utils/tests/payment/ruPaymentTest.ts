import { logger } from '@/utils/logger'
import assert from '@/test-utils/core/assert'
import { InngestFunctionTester } from '../../testers/InngestFunctionTester'
import { v4 as uuidv4 } from 'uuid'

/**
 * Тестер для функции RU Payment Service
 * Позволяет тестировать различные сценарии обработки платежей через российскую платежную систему
 */
export class RuPaymentTester extends InngestFunctionTester<any, any> {
  constructor(options: any = {}) {
    super('ru-payment-processing', {
      name: 'RU Payment Test',
      ...options,
    })
  }

  /**
   * Тестирует успешную обработку платежа через Robokassa для пакета звезд
   */
  async testSuccessfulStarsPackage(): Promise<any> {
    const inv_id = `test-${uuidv4()}`
    const amount = 1000 // Сумма в рублях
    const stars = 434 // Соответствующее количество звезд

    logger.info('🧪 Тест успешной оплаты пакета звезд', {
      description: 'Testing successful stars package payment',
      inv_id,
      amount,
      stars,
    })

    // Создаем данные для события
    const eventData = {
      IncSum: amount.toString(),
      inv_id,
    }

    // Мокаем getTelegramIdFromInvId чтобы возвращал тестовые данные пользователя
    this._mockGetTelegramIdFromInvId(inv_id)

    // Мокаем updatePaymentStatus
    this._mockUpdatePaymentStatus()

    // Мокаем отправку события payment/process
    this._mockPaymentProcessEvent()

    // Мокаем отправку уведомлений
    this._mockSendNotifications()

    // Отправляем событие ru-payment/process-payment
    const result = await this.sendEvent('ru-payment/process-payment', { data: eventData })

    // Проверяем успешность
    assert.equal(result.success, true)
    assert.equal(result.stars, stars)
    assert.equal(parseInt(result.amount), amount)

    logger.info('✅ Тест успешной оплаты пакета звезд завершен', {
      description: 'Successful stars package payment test completed',
      result,
    })

    return result
  }

  /**
   * Тестирует успешную обработку платежа через Robokassa для подписки
   */
  async testSuccessfulSubscription(): Promise<any> {
    const inv_id = `test-${uuidv4()}`
    const amount = 1110 // Сумма в рублях для подписки NeuroPhoto
    const stars = 476 // Соответствующее количество звезд
    const subscription = 'neurophoto'

    logger.info('🧪 Тест успешной оплаты подписки', {
      description: 'Testing successful subscription payment',
      inv_id,
      amount,
      stars,
      subscription,
    })

    // Создаем данные для события
    const eventData = {
      IncSum: amount.toString(),
      inv_id,
    }

    // Мокаем getTelegramIdFromInvId чтобы возвращал тестовые данные пользователя
    this._mockGetTelegramIdFromInvId(inv_id)

    // Мокаем updatePaymentStatus
    this._mockUpdatePaymentStatus()

    // Мокаем updateUserSubscription
    this._mockUpdateUserSubscription()

    // Мокаем отправку события payment/process
    this._mockPaymentProcessEvent()

    // Мокаем отправку уведомлений
    this._mockSendNotifications()

    // Отправляем событие ru-payment/process-payment
    const result = await this.sendEvent('ru-payment/process-payment', { data: eventData })

    // Проверяем успешность
    assert.equal(result.success, true)
    assert.equal(result.stars, stars)
    assert.equal(parseInt(result.amount), amount)
    assert.equal(result.subscription, subscription)

    logger.info('✅ Тест успешной оплаты подписки завершен', {
      description: 'Successful subscription payment test completed',
      result,
    })

    return result
  }

  /**
   * Тестирует неудачную обработку платежа с некорректной суммой
   */
  async testInvalidAmount(): Promise<any> {
    const inv_id = `test-${uuidv4()}`
    const amount = 1234 // Некорректная сумма, не соответствующая ни одному пакету или подписке

    logger.info('🧪 Тест платежа с некорректной суммой', {
      description: 'Testing payment with invalid amount',
      inv_id,
      amount,
    })

    // Создаем данные для события
    const eventData = {
      IncSum: amount.toString(),
      inv_id,
    }

    // Мокаем getTelegramIdFromInvId чтобы возвращал тестовые данные пользователя
    this._mockGetTelegramIdFromInvId(inv_id)

    // Мокаем updatePaymentStatus
    this._mockUpdatePaymentStatus()

    // Отправляем событие ru-payment/process-payment
    const result = await this.sendEvent('ru-payment/process-payment', { data: eventData })

    // Проверяем отсутствие успеха
    assert.equal(result.success, false)
    assert.isTrue(!!result.reason, 'Должна быть указана причина ошибки')

    logger.info('✅ Тест платежа с некорректной суммой завершен', {
      description: 'Invalid amount payment test completed',
      result,
    })

    return result
  }

  /**
   * Запуск всех тестов для RU Payment Service
   */
  async runAllTests(): Promise<any[]> {
    logger.info('🚀 Запуск всех тестов RU Payment Service', {
      description: 'Running all RU Payment Service tests',
    })

    const results = []

    try {
      const starsResult = await this.testSuccessfulStarsPackage()
      results.push({
        name: 'Успешная оплата пакета звезд',
        success: starsResult.success,
        result: starsResult,
      })
    } catch (error) {
      results.push({
        name: 'Успешная оплата пакета звезд',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      const subscriptionResult = await this.testSuccessfulSubscription()
      results.push({
        name: 'Успешная оплата подписки',
        success: subscriptionResult.success,
        result: subscriptionResult,
      })
    } catch (error) {
      results.push({
        name: 'Успешная оплата подписки',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      const invalidResult = await this.testInvalidAmount()
      results.push({
        name: 'Обработка некорректной суммы',
        success: !invalidResult.success, // Мы ожидаем, что результат будет неуспешным
        result: invalidResult,
      })
    } catch (error) {
      results.push({
        name: 'Обработка некорректной суммы',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    const successCount = results.filter(r => r.success).length
    const totalCount = results.length

    logger.info('✅ Все тесты RU Payment Service выполнены', {
      description: 'All RU Payment Service tests completed',
      successCount,
      totalCount,
    })

    return results
  }

  /**
   * Выполняет тестирование RU Payment Service
   */
  async executeTest(method?: string): Promise<any> {
    logger.info('🧪 Выполнение тестов RU Payment Service', {
      description: 'Executing RU Payment Service tests',
      method: method || 'all',
    })

    const startTime = Date.now()

    try {
      let result

      if (!method || method === 'all') {
        result = await this.runAllTests()
      } else if (method === 'stars') {
        result = await this.testSuccessfulStarsPackage()
      } else if (method === 'subscription') {
        result = await this.testSuccessfulSubscription()
      } else if (method === 'invalid') {
        result = await this.testInvalidAmount()
      } else {
        throw new Error(`Неизвестный метод: ${method}`)
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      logger.info('✅ Тесты RU Payment Service успешно выполнены', {
        description: 'RU Payment Service tests successfully completed',
        duration,
        method: method || 'all',
      })

      return result
    } catch (error) {
      const endTime = Date.now()
      const duration = endTime - startTime

      logger.error('❌ Ошибка при выполнении тестов RU Payment Service', {
        description: 'Error executing RU Payment Service tests',
        error: error instanceof Error ? error.message : String(error),
        duration,
        method: method || 'all',
      })

      throw error
    }
  }

  // Вспомогательные методы для мокирования

  private _mockGetTelegramIdFromInvId(inv_id: string): void {
    this.mockFunction('@/helpers/getTelegramIdFromInvId', async (id: string) => {
      // Проверяем, что функция вызвана с правильными параметрами
      assert.equal(id, inv_id)
      
      // Возвращаем тестовые данные пользователя
      return {
        telegram_id: 123456789,
        username: 'test_user',
        language_code: 'ru',
        bot_name: 'test_bot',
      }
    })
  }

  private _mockUpdatePaymentStatus(): void {
    this.mockFunction('@/core/supabase/updatePaymentStatus', async () => {
      return { success: true }
    })
  }

  private _mockUpdateUserSubscription(): void {
    this.mockFunction('@/core/supabase/updateUserSubscription', async () => {
      return { success: true }
    })
  }

  private _mockPaymentProcessEvent(): void {
    this.mockFunction('inngest.send', async () => {
      return { success: true }
    })
  }

  private _mockSendNotifications(): void {
    this.mockFunction('@/price/helpers/sendPaymentNotificationToUser', async () => {
      return { success: true }
    })

    this.mockFunction('@/price/helpers/sendPaymentNotificationWithBot', async () => {
      return { success: true }
    })

    this.mockFunction('createBotByName', async () => {
      return { 
        bot: {
          telegram: {
            sendMessage: async () => ({ message_id: 123 })
          }
        },
        groupId: '9876543210'
      }
    })
  }
}

/**
 * Запускает тесты для RU Payment Service
 */
export async function runRuPaymentTests(options: { verbose?: boolean } = {}): Promise<any> {
  const tester = new RuPaymentTester({
    verbose: options.verbose,
  })

  logger.info('🚀 Запуск тестов RU Payment Service...', {
    description: 'Starting RU Payment Service Tests...',
  })

  try {
    const results = await tester.executeTest()
    
    return {
      success: true,
      results,
    }
  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов RU Payment Service', {
      error: error instanceof Error ? error.message : String(error),
    })
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
} 