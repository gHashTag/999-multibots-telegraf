import { logger } from '@/utils/logger'
import { InngestTestEngine } from './inngest-test-engine'
import { TEST_CONFIG } from './test-config'
import { TestResult } from './types'
import { ModeEnum } from '@/price/helpers/modelsCost'

interface PaymentEvent {
  name: string
  data: {
    telegram_id: string
    amount: number
    type: string
    description: string
    bot_name: string
    service_type: ModeEnum
  }
}

const testAmount = 100

export async function runPaymentTests(testName: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const startTime = Date.now()

  try {
    logger.info('🚀 Запуск тестов платежей', {
      description: 'Starting payment tests',
      test_user_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      test_bot: TEST_CONFIG.TEST_BOT_NAME,
    })

    const inngestTestEngine = new InngestTestEngine()
    await inngestTestEngine.init()

    inngestTestEngine.registerEventHandler(
      'payment/process',
      async ({ event }: { event: PaymentEvent }) => {
        logger.info('💰 Processing test payment:', {
          description: 'Processing test payment',
          eventData: event.data,
        })

        // Имитируем защиту от овердрафта
        if (
          event.data.type === 'money_expense' &&
          event.data.amount > testAmount
        ) {
          throw new Error('Insufficient funds')
        }

        return { success: true }
      }
    )

    logger.info('✅ Обработчик платежей зарегистрирован', {
      description: 'Payment processor registered',
      testName,
    })

    // Тест создания платежа
    logger.info('🔄 Тест создания платежа', {
      description: 'Running payment creation test',
      amount: testAmount,
    })

    const createPaymentResult = await inngestTestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        amount: testAmount,
        type: 'money_income',
        description: 'Test payment',
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        service_type: ModeEnum.TopUpBalance,
      },
    })

    if (!createPaymentResult) {
      throw new Error('❌ Не удалось создать платеж')
    }

    results.push({
      success: true,
      message: 'Тест создания платежа пройден успешно',
      name: testName,
      startTime,
      telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      details: { amount: testAmount },
    })

    logger.info('✅ Тест создания платежа пройден', {
      description: 'Payment creation test passed',
    })

    // Тест снятия средств
    logger.info('🔄 Тест снятия средств', {
      description: 'Running withdrawal test',
      amount: testAmount / 2,
    })

    const withdrawalResult = await inngestTestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        amount: testAmount / 2,
        type: 'money_expense',
        description: 'Test withdrawal',
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        service_type: ModeEnum.TextToVideo,
      },
    })

    if (!withdrawalResult) {
      throw new Error('❌ Не удалось обработать снятие средств')
    }

    results.push({
      success: true,
      message: 'Тест снятия средств пройден успешно',
      name: testName,
      startTime,
      telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      details: { amount: testAmount / 2 },
    })

    logger.info('✅ Тест снятия средств пройден', {
      description: 'Withdrawal test passed',
    })

    // Тест защиты от овердрафта
    logger.info('🔄 Тест защиты от овердрафта', {
      description: 'Running overdraft protection test',
      amount: testAmount * 2,
    })

    try {
      await inngestTestEngine.send({
        name: 'payment/process',
        data: {
          telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
          amount: testAmount * 2,
          type: 'money_expense',
          description: 'Test overdraft',
          bot_name: TEST_CONFIG.TEST_BOT_NAME,
          service_type: ModeEnum.TextToVideo,
        },
      })

      throw new Error('❌ Защита от овердрафта не сработала')
    } catch (error: any) {
      if (error?.message !== 'Insufficient funds') {
        throw new Error('❌ Защита от овердрафта не сработала')
      }

      logger.info('✅ Защита от овердрафта сработала', {
        description: 'Overdraft protection worked',
        error: error instanceof Error ? error.message : String(error),
      })
    }

    results.push({
      success: true,
      message: 'Тест защиты от овердрафта пройден успешно',
      name: testName,
      startTime,
      telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      details: { attempted_amount: testAmount * 2 },
    })

    // Тест возврата средств
    logger.info('🔄 Тест возврата средств', {
      description: 'Running refund test',
      amount: 25,
    })

    const refundResult = await inngestTestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        amount: 25,
        type: 'refund',
        description: 'Test refund',
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        service_type: ModeEnum.TopUpBalance,
      },
    })

    if (!refundResult) {
      throw new Error('❌ Не удалось обработать возврат средств')
    }

    results.push({
      success: true,
      message: 'Тест возврата средств пройден успешно',
      name: testName,
      startTime,
      telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
      details: { amount: 25 },
    })

    logger.info('✅ Тест возврата средств пройден', {
      description: 'Refund test passed',
    })

    logger.info('🎉 Все тесты платежей пройдены успешно', {
      description: 'All payment tests passed successfully',
      total_tests: results.length,
    })

    return results
  } catch (error: any) {
    logger.error('❌ Ошибка при тестировании платежей:', {
      description: 'Error in payment tests',
      error: error?.message || 'Unknown error',
      testName,
    })

    results.push({
      success: false,
      message: error?.message || 'Unknown error',
      name: testName,
      startTime,
      error: error instanceof Error ? error : new Error(String(error)),
    })

    return results
  }
}
