import { TestResult } from '../../../types'
import { inngestTestEngine } from '../../../core/inngestTestEngine'
import { ModeEnum } from '@/types/modes'
import { logger } from '@/utils/logger'
import { testRuPayment } from './test-ru-payment'
import { testRobokassa } from './test-robokassa'
import { testRobokassaFormAvailability } from '../utils/robokassaFormValidator.test'

// RuPayment test
export async function testRuPayment(): Promise<TestResult> {
  try {
    logger.info('🚀 Starting RuPayment test...')

    await inngestTestEngine.clearEventHistory()

    const testData = {
      telegram_id: '123456789',
      amount: 100,
      type: 'money_income',
      description: 'Test RuPayment integration',
      bot_name: 'test_bot',
      service_type: ModeEnum.TopUpBalance,
      payment_method: 'RuPayment',
    }

    await inngestTestEngine.send({
      name: 'payment/process',
      data: testData,
    })

    const events = await inngestTestEngine.getProcessedEvents()

    if (!events.length) {
      throw new Error('RuPayment test event was not processed')
    }

    logger.info('✅ RuPayment test completed successfully')
    return {
      success: true,
      message: 'RuPayment test passed',
      name: 'RuPayment Test',
    }
  } catch (error) {
    logger.error(
      '❌ RuPayment test failed:',
      error instanceof Error ? error.message : String(error)
    )
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      name: 'RuPayment Test',
    }
  }
}

// Тест интеграции с Robokassa
export async function testRobokassa(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста Robokassa...')

    await inngestTestEngine.clearEventHistory()

    const testData = {
      telegram_id: '123456789',
      amount: 100,
      stars: 100,
      type: 'money_income',
      description: 'Тест интеграции Robokassa',
      bot_name: 'test_bot',
      service_type: ModeEnum.TopUpBalance,
      payment_method: 'Robokassa',
      inv_id: 'TEST-123',
    }

    await inngestTestEngine.send({
      name: 'payment/process',
      data: testData,
    })

    const events = await inngestTestEngine.getProcessedEvents()

    if (!events.length) {
      throw new Error('Событие Robokassa не было обработано')
    }

    // Проверяем корректность обработки платежа через Robokassa
    const paymentEvent = events[0]
    if (paymentEvent.data.payment_method !== 'Robokassa') {
      throw new Error('Некорректный метод оплаты')
    }

    logger.info('✅ Тест Robokassa успешно завершен')
    return {
      success: true,
      message: 'Тест Robokassa пройден',
      name: 'Тест Robokassa',
    }
  } catch (error) {
    logger.error(
      '❌ Тест Robokassa не пройден:',
      error instanceof Error ? error.message : String(error)
    )
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      name: 'Тест Robokassa',
    }
  }
}

export const paymentIntegrationTests = {
  testRuPayment,
  testRobokassa,
  testRobokassaFormAvailability,
}

export async function runIntegrationTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск интеграционных тестов', {
    description: 'Starting integration tests',
  })

  const results: TestResult[] = []

  // Тест доступности формы оплаты
  const formResult = await testRobokassaFormAvailability()
  results.push(formResult)

  // Логируем общий результат
  const allSuccess = results.every(result => result.success)

  if (allSuccess) {
    logger.info('✅ Все интеграционные тесты пройдены успешно', {
      description: 'All integration tests passed successfully',
    })
  } else {
    logger.error('❌ Некоторые интеграционные тесты не прошли', {
      description: 'Some integration tests failed',
      results: results.filter(r => !r.success).map(r => r.message),
    })
  }

  return results
}
