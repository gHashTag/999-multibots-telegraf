import { logger } from '@/utils/logger'
import { TestResult } from '../../../types'
import { TEST_CONFIG } from '../../../test-config'
import { inngestTestEngine } from '../../../inngest-test-engine'

export async function runGetUserBalanceTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста проверки баланса...')

    // Подготовка тестовых данных
    const testData = {
      telegram_id: TEST_CONFIG.TEST_USER_ID,
      amount: 100,
      type: 'money_income',
      description: 'Test balance check',
      bot_name: 'test_bot',
      service_type: 'TopUpBalance',
    }

    // Отправка тестового платежа
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: testData,
      timestamp: Date.now(),
    })

    // Ожидание обработки платежа
    const paymentResult =
      await inngestTestEngine.waitForEvent('payment/completed')

    if (!paymentResult) {
      throw new Error('Платеж не был обработан')
    }

    // Проверка баланса через функцию getUserBalance
    const balance = await inngestTestEngine.executeQuery(
      'SELECT get_user_balance($1)'
    )

    if (balance !== testData.amount) {
      throw new Error(
        `Неверный баланс: ${balance}, ожидалось: ${testData.amount}`
      )
    }

    // Проверка отрицательного сценария
    const invalidBalance = await inngestTestEngine.executeQuery(
      'SELECT get_user_balance($1)'
    )

    if (invalidBalance !== 0) {
      throw new Error(
        `Неверный баланс для несуществующего пользователя: ${invalidBalance}, ожидалось: 0`
      )
    }

    return {
      success: true,
      message: 'Тест проверки баланса успешно пройден',
      name: 'GetUserBalance',
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      name: 'GetUserBalance',
    }
  }
}
