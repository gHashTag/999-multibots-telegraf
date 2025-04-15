import { TestResult } from '../../../types'
import { testEngine } from '../../../test-config'
import { ModeEnum } from '../../../../types/enums'
import { PaymentProcessParams } from '../../../../types/payment'
import { TransactionType } from '../../../../types/payment'

export async function runPaymentProcessorTest(): Promise<TestResult> {
  try {
    // Очищаем тестовые данные
    await testEngine.cleanupTestData()

    // Создаем тестовый платеж
    const testPayment: PaymentProcessParams = {
      telegram_id: '123456789',
      amount: 100,
      type: TransactionType.MONEY_INCOME,
      description: 'Test payment',
      bot_name: 'test_bot',
      service_type: ModeEnum.NeuroPhoto,
    }

    // Отправляем событие
    await testEngine.sendEvent('payment/process', testPayment)

    // Ждем обработки платежа
    const processedEvent = await testEngine.waitForEvent('payment/processed')

    // Проверяем результат
    if (processedEvent?.data?.success) {
      return {
        success: true,
        message: '✅ Payment processor test passed successfully',
        name: 'Payment Processor Test',
      }
    }

    return {
      success: false,
      message:
        '❌ Payment processor test failed - payment was not processed successfully',
      name: 'Payment Processor Test',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: `❌ Payment processor test failed with error: ${errorMessage}`,
      name: 'Payment Processor Test',
    }
  }
}
