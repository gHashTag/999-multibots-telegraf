import { TestResult } from '../../../types'
import { TEST_CONFIG, TestEngine, TestEvent } from '../../../test-config'
import { ModeEnum } from '@/types/enums'
import { TransactionType, TestPayment } from '@/types/payments'
import { logger } from '@/utils/logger'

const inngestTestEngine = new TestEngine()

export async function testPaymentProcessing(): Promise<TestResult> {
  try {
    logger.info('🚀 Начинаю тест обработки платежа')

    const testPayment: TestPayment = {
      telegram_id: TEST_CONFIG.testUser.telegram_id,
      amount: TEST_CONFIG.testAmount,
      type: TransactionType.MONEY_INCOME,
      description: TEST_CONFIG.testDescription,
      bot_name: TEST_CONFIG.testBotName,
      service_type: ModeEnum.TopUpBalance,
    }

    const event: TestEvent = {
      name: 'payment/process',
      data: testPayment,
    }

    await inngestTestEngine.sendEvent(event)

    logger.info('✅ Тест обработки платежа успешно завершен')
    return {
      success: true,
      message: 'Тест обработки платежа пройден успешно',
      name: 'Payment Processing Test',
    }
  } catch (error) {
    logger.error('❌ Ошибка при тестировании обработки платежа:', error)
    return {
      success: false,
      message: `Ошибка при тестировании обработки платежа: ${error}`,
      name: 'Payment Processing Test',
    }
  }
}
