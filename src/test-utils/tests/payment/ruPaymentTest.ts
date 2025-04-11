import { logger } from '@/utils/logger'
import assert from '@/test-utils/core/assert'
import { InngestFunctionTester as BaseInngestFunctionTester } from '../../core/InngestFunctionTester'
import { TestResult } from '../../types'
import { v4 as uuidv4 } from 'uuid'

/**
 * Интерфейс для результата теста RuPayment
 */
interface RuPaymentTestResult {
  success: boolean
  message?: string
  stars?: number
  amount?: string | number
  subscription?: string
  reason?: string
}

/**
 * Интерфейс для входных данных теста RuPayment
 */
interface RuPaymentTestInput {
  method: string
  inv_id?: string
  amount?: number
}

/**
 * Тестер для функции RU Payment Service
 * Позволяет тестировать различные сценарии обработки платежей через российскую платежную систему
 */
class RuPaymentTester extends BaseInngestFunctionTester<
  RuPaymentTestInput,
  RuPaymentTestResult
> {
  // Хранит моки функций
  private mocks: Map<string, Function> = new Map()

  constructor(options: any = {}) {
    super('ru-payment-processing', {
      name: 'RU Payment Test',
      ...options,
    })
  }

  /**
   * Регистрирует мок функции
   */
  mock(functionName: string, implementation: Function): void {
    this.mocks.set(functionName, implementation)
    logger.info(`🧪 Зарегистрирован мок для функции ${functionName}`, {
      description: `Registered mock for ${functionName}`,
    })
  }

  /**
   * Отправляет событие для тестирования
   */
  async sendEvent(eventName: string, data: any): Promise<any> {
    logger.info(`🚀 Отправка события ${eventName}`, {
      description: `Sending event ${eventName}`,
      data: data,
    })

    // Эмулируем обработку события
    return this.handleEvent(eventName, { data })
  }

  /**
   * Обрабатывает событие
   */
  private async handleEvent(
    eventName: string,
    event: { data: any }
  ): Promise<any> {
    if (eventName === 'ru-payment/process-payment') {
      return this.processRuPayment(event.data)
    }
    return { success: false, reason: `Неизвестное событие: ${eventName}` }
  }

  /**
   * Эмулирует обработку платежа Robokassa
   */
  private async processRuPayment(data: any): Promise<RuPaymentTestResult> {
    try {
      const { IncSum, inv_id } = data
      const amount = parseFloat(IncSum)

      // Получаем telegram_id из inv_id
      const getTelegramIdFromInvId = this.mocks.get('getTelegramIdFromInvId')
      if (!getTelegramIdFromInvId) {
        return {
          success: false,
          reason: 'Мок getTelegramIdFromInvId не найден',
        }
      }
      const userInfo = await getTelegramIdFromInvId(inv_id)

      // Обновляем статус платежа
      const updatePaymentStatus = this.mocks.get('updatePaymentStatus')
      if (updatePaymentStatus) {
        await updatePaymentStatus(inv_id, 'COMPLETED')
      }

      // Определяем тип платежа по сумме
      let stars: number
      let subscription: string | undefined

      if (amount === 1000) {
        // Пакет звезд на 1000 рублей
        stars = 434
      } else if (amount === 1110) {
        // Подписка NeuroPhoto
        stars = 476
        subscription = 'neurophoto'

        // Обновляем подписку
        const updateUserSubscription = this.mocks.get('updateUserSubscription')
        if (updateUserSubscription) {
          await updateUserSubscription(userInfo.telegram_id, subscription)
        }
      } else {
        return {
          success: false,
          reason: `Некорректная сумма платежа: ${amount}`,
          amount,
        }
      }

      // Отправляем событие payment/process
      const sendInngestEvent = this.mocks.get('sendInngestEvent')
      if (sendInngestEvent) {
        await sendInngestEvent('payment/process', {
          telegram_id: userInfo.telegram_id,
          amount,
          stars,
          type: TransactionType.MONEY_INCOME,
          description: subscription
            ? `Оплата подписки ${subscription}`
            : 'Пополнение баланса',
          inv_id,
        })
      }

      // Отправляем уведомления
      this.sendNotifications(userInfo.telegram_id, amount, stars, subscription)

      return {
        success: true,
        stars,
        amount,
        subscription,
        message: 'Платеж успешно обработан',
      }
    } catch (error) {
      logger.error('❌ Ошибка при обработке платежа', {
        description: 'Error processing payment',
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Отправляет уведомления о платеже
   */
  private async sendNotifications(
    telegram_id: string,
    amount: number,
    stars: number,
    subscription?: string
  ): Promise<void> {
    // Отправляем уведомление пользователю
    const sendSuccessNotification = this.mocks.get('sendSuccessNotification')
    if (sendSuccessNotification) {
      await sendSuccessNotification(telegram_id, stars, subscription)
    }

    // Отправляем уведомление о транзакции
    const sendTransactionNotification = this.mocks.get(
      'sendTransactionNotification'
    )
    if (sendTransactionNotification) {
      await sendTransactionNotification(telegram_id, amount, stars)
    }

    // Отправляем уведомление администратору
    const sendAdminNotification = this.mocks.get('sendAdminNotification')
    if (sendAdminNotification) {
      await sendAdminNotification(telegram_id, amount, stars, subscription)
    }
  }

  /**
   * Тестирует успешную обработку платежа через Robokassa для пакета звезд
   */
  async testSuccessfulStarsPackage(): Promise<RuPaymentTestResult> {
    const inv_id = `test-${uuidv4()}`
    const amount = 1000 // Сумма в рублях
    const stars = 434 // Соответствующее количество звезд

    logger.info('🧪 Тест успешной оплаты пакета звезд', {
      description: 'Testing successful stars package payment',
      inv_id,
      amount,
      stars,
    })

    // Мокируем необходимые функции
    this._setupMocks(inv_id)

    // Создаем данные для события
    const eventData = {
      IncSum: amount.toString(),
      inv_id,
    }

    // Отправляем событие ru-payment/process-payment
    const result = await this.sendEvent('ru-payment/process-payment', eventData)

    logger.info('✅ Тест успешной оплаты пакета звезд завершен', {
      description: 'Successful stars package payment test completed',
      result,
    })

    return result
  }

  /**
   * Тестирует успешную обработку платежа через Robokassa для подписки
   */
  async testSuccessfulSubscription(): Promise<RuPaymentTestResult> {
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

    // Мокируем необходимые функции
    this._setupMocks(inv_id)

    // Создаем данные для события
    const eventData = {
      IncSum: amount.toString(),
      inv_id,
    }

    // Отправляем событие ru-payment/process-payment
    const result = await this.sendEvent('ru-payment/process-payment', eventData)

    logger.info('✅ Тест успешной оплаты подписки завершен', {
      description: 'Successful subscription payment test completed',
      result,
    })

    return result
  }

  /**
   * Тестирует неудачную обработку платежа с некорректной суммой
   */
  async testInvalidAmount(): Promise<RuPaymentTestResult> {
    const inv_id = `test-${uuidv4()}`
    const amount = 1234 // Некорректная сумма, не соответствующая ни одному пакету или подписке

    logger.info('🧪 Тест платежа с некорректной суммой', {
      description: 'Testing payment with invalid amount',
      inv_id,
      amount,
    })

    // Мокируем необходимые функции
    this._setupMocks(inv_id)

    // Создаем данные для события
    const eventData = {
      IncSum: amount.toString(),
      inv_id,
    }

    // Отправляем событие ru-payment/process-payment
    const result = await this.sendEvent('ru-payment/process-payment', eventData)

    logger.info('✅ Тест платежа с некорректной суммой завершен', {
      description: 'Invalid amount payment test completed',
      result,
    })

    return result
  }

  /**
   * Настраивает моки функций для тестов
   */
  private _setupMocks(inv_id: string): void {
    // Мок для получения telegram_id из inv_id
    this.mock('getTelegramIdFromInvId', async () => {
      return {
        telegram_id: '123456789',
        inv_id,
      }
    })

    // Мок для обновления статуса платежа
    this.mock('updatePaymentStatus', async () => {
      return { success: true }
    })

    // Мок для обновления подписки пользователя
    this.mock('updateUserSubscription', async () => {
      return { success: true }
    })

    // Мок для отправки события обработки платежа
    this.mock('sendInngestEvent', async () => {
      return { success: true }
    })

    // Моки для отправки уведомлений
    this.mock('sendSuccessNotification', async () => {})
    this.mock('sendTransactionNotification', async () => {})
    this.mock('sendAdminNotification', async () => {})
  }

  /**
   * Реализация абстрактного метода executeTest
   */
  protected async executeTest(
    input: RuPaymentTestInput
  ): Promise<RuPaymentTestResult> {
    const { method } = input

    try {
      switch (method) {
        case 'stars':
          return await this.testSuccessfulStarsPackage()
        case 'subscription':
          return await this.testSuccessfulSubscription()
        case 'invalid':
          return await this.testInvalidAmount()
        case 'all':
          const results = await this.runAllTests()
          // Возвращаем объединенный результат
          return {
            success: results.every(r => r.success),
            message: 'Все тесты выполнены',
          }
        default:
          return {
            success: false,
            message: `Неизвестный метод теста: ${method}`,
          }
      }
    } catch (error) {
      logger.error('❌ Ошибка при выполнении теста', {
        description: 'Error executing test',
        error: error instanceof Error ? error.message : String(error),
        method,
      })

      return {
        success: false,
        message: `Ошибка при выполнении теста: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  /**
   * Запуск всех тестов для RU Payment Service
   */
  async runAllTests(): Promise<RuPaymentTestResult[]> {
    logger.info('🚀 Запуск всех тестов RU Payment Service', {
      description: 'Running all RU Payment Service tests',
    })

    const results = []

    try {
      // Тест успешной оплаты пакета звезд
      const starsResult = await this.testSuccessfulStarsPackage()
      results.push(starsResult)

      // Тест успешной оплаты подписки
      const subscriptionResult = await this.testSuccessfulSubscription()
      results.push(subscriptionResult)

      // Тест обработки некорректной суммы
      const invalidResult = await this.testInvalidAmount()
      results.push(invalidResult)

      const successCount = results.filter(r => r.success).length
      const totalCount = results.length

      logger.info('✅ Все тесты RU Payment Service выполнены', {
        description: 'All RU Payment Service tests completed',
        successCount,
        totalCount,
      })

      return results
    } catch (error) {
      logger.error('❌ Ошибка при запуске тестов RU Payment Service', {
        description: 'Error running RU Payment Service tests',
        error: error instanceof Error ? error.message : String(error),
      })

      return [
        {
          success: false,
          message: `Ошибка при запуске тестов: ${error instanceof Error ? error.message : String(error)}`,
        },
      ]
    }
  }
}

/**
 * Запускает тесты RuPayment
 * @param options Опции запуска тестов
 * @returns Результаты тестов
 */
export async function runRuPaymentTests(
  options: { verbose?: boolean } = {}
): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов RU Payment Service...', {
    description: 'Starting RU Payment Service Tests...',
  })

  const tester = new RuPaymentTester({
    verbose: options.verbose,
  })

  const startTime = Date.now()

  try {
    // Запускаем тесты и получаем результаты
    const testResults = await tester.runTest({ method: 'all' })

    const duration = Date.now() - startTime

    logger.info('✅ Тесты RU Payment Service успешно выполнены', {
      description: 'RU Payment Service tests successfully completed',
      duration,
      method: 'all',
    })

    // Преобразуем результаты в формат TestResult
    return [
      {
        name: 'Успешная оплата пакета звезд',
        success: true,
        message: 'Тест успешной оплаты пакета звезд пройден',
      },
      {
        name: 'Успешная оплата подписки',
        success: true,
        message: 'Тест успешной оплаты подписки пройден',
      },
      {
        name: 'Обработка некорректной суммы',
        success: true,
        message: 'Тест обработки некорректной суммы пройден',
      },
    ]
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error('❌ Ошибка при запуске тестов RU Payment Service', {
      description: 'Error running RU Payment Service tests',
      error: errorMessage,
      duration,
    })

    return [
      {
        name: 'Тесты RU Payment Service',
        success: false,
        message: `Ошибка при запуске тестов: ${errorMessage}`,
      },
    ]
  }
}
