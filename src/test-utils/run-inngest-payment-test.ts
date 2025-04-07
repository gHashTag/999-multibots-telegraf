import { logger } from '@/utils/logger'
import { TestResult } from './types'
import { inngestTestEngine } from './test-config'
import { ModeEnum } from '@/price/helpers/modelsCost'

export async function runInngestPaymentTest(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const testUserId = '123456789'

  try {
    logger.info('🚀 Запуск тестов платежной системы через Inngest', {
      description: 'Starting payment system tests via Inngest',
      test_user_id: testUserId,
    })

    // Тест пополнения баланса
    const depositAmount = 100
    await inngestTestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testUserId,
        amount: depositAmount,
        type: 'money_income',
        description: 'Тестовое пополнение баланса',
        bot_name: 'test_bot',
        service_type: ModeEnum.TopUpBalance,
      },
    })

    logger.info('💰 Отправлен запрос на пополнение баланса', {
      description: 'Balance deposit request sent',
      amount: depositAmount,
      user_id: testUserId,
    })

    results.push({
      name: 'Тест пополнения баланса',
      success: true,
      message: `Запрос на пополнение баланса на ${depositAmount} отправлен`,
    })

    // Тест списания средств
    const withdrawAmount = 50
    await inngestTestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testUserId,
        amount: withdrawAmount,
        type: 'money_expense',
        description: 'Тестовое списание средств',
        bot_name: 'test_bot',
        service_type: ModeEnum.TextToVideo,
      },
    })

    logger.info('💸 Отправлен запрос на списание средств', {
      description: 'Balance withdrawal request sent',
      amount: withdrawAmount,
      user_id: testUserId,
    })

    results.push({
      name: 'Тест списания средств',
      success: true,
      message: `Запрос на списание ${withdrawAmount} отправлен`,
    })

    return results
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))

    logger.error('❌ Ошибка при выполнении тестов платежной системы', {
      description: 'Error in payment system tests',
      error: err.message,
      stack: err.stack,
    })

    results.push({
      name: 'Тесты платежной системы',
      success: false,
      message: `Ошибка при выполнении тестов: ${err.message}`,
      error: err,
    })

    return results
  }
}
