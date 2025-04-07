import { logger } from '@/utils/logger'
import { TestResult } from './types'
import { TEST_CONFIG } from './test-config'
import { ModeEnum } from '@/interfaces/app.interface'
import { inngest } from '@/core/inngest'

const testAmount = 100

export async function runPaymentTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    logger.info('🚀 Starting payment tests', {
      test_user_id: TEST_CONFIG.TEST_USER_ID,
      description: 'Running payment system tests',
    })

    // Тест создания платежа
    const createPaymentResult = await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_USER_ID,
        amount: testAmount,
        type: 'money_income',
        description: 'Test payment',
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        service_type: ModeEnum.TopUpBalance,
      },
    })

    if (!createPaymentResult) {
      throw new Error('Failed to create payment')
    }

    results.push({
      success: true,
      message: 'Payment creation test passed',
      name: 'Create Payment Test',
    })

    // Тест снятия средств
    const withdrawalResult = await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_USER_ID,
        amount: testAmount / 2,
        type: 'money_expense',
        description: 'Test withdrawal',
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        service_type: ModeEnum.TextToImage,
      },
    })

    if (!withdrawalResult) {
      throw new Error('Failed to process withdrawal')
    }

    results.push({
      success: true,
      message: 'Withdrawal test passed',
      name: 'Withdrawal Test',
    })

    // Тест защиты от овердрафта
    const overdraftResult = await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_USER_ID,
        amount: testAmount * 2,
        type: 'money_expense',
        description: 'Test overdraft',
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        service_type: ModeEnum.TextToImage,
      },
    })

    if (overdraftResult) {
      throw new Error('Overdraft protection failed')
    }

    results.push({
      success: true,
      message: 'Overdraft protection test passed',
      name: 'Overdraft Protection Test',
    })

    logger.info('✅ All payment tests completed successfully')

    return results
  } catch (error) {
    logger.error('❌ Ошибка в тесте платежей:', {
      description: 'Error in payment tests',
      error: error instanceof Error ? error.message : String(error),
    })

    results.push({
      success: false,
      message: 'Ошибка в тесте платежей',
      name: 'Payment Tests',
      error: error instanceof Error ? error : new Error(String(error)),
    })
  }

  return results
}
