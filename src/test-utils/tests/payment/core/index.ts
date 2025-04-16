import { TestResult } from '../../../types'
import { inngestTestEngine } from '../../../core/inngestTestEngine'
import { ModeEnum } from '@/types/modes'
import { PaymentEventData, ProcessedEvent } from '@/types/inngest'
import { logger } from '@/utils/logger'

// Main payment processor test
export async function testPaymentProcessor(): Promise<TestResult> {
  try {
    logger.info('🚀 Starting payment processor tests...')

    await inngestTestEngine.clearEventHistory()

    const testData: PaymentEventData = {
      telegram_id: '123456789',
      amount: 100,
      stars: 100,
      type: 'money_income',
      description: 'Test payment',
      bot_name: 'test_bot',
      service_type: ModeEnum.TopUpBalance,
    }

    await inngestTestEngine.send({
      name: 'payment/process',
      data: testData,
    })

    await inngestTestEngine.waitForEvents()
    const events = await inngestTestEngine.getProcessedEvents()

    if (!events.length) {
      throw new Error('Payment event was not processed')
    }

    const paymentEvent = events[0] as ProcessedEvent

    if (paymentEvent.data.error) {
      throw new Error(`Payment processing failed: ${paymentEvent.data.error}`)
    }

    logger.info('✅ Payment processor test completed successfully')

    return {
      success: true,
      message: 'Payment processor test passed',
      name: 'Payment Processor Test',
    }
  } catch (error) {
    logger.error(
      '❌ Payment processor test failed:',
      error instanceof Error ? error.message : String(error)
    )

    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      name: 'Payment Processor Test',
    }
  }
}

// Export all payment core tests
export const paymentCoreTests = {
  testPaymentProcessor,
}
