import { logger } from '@/utils/logger'
import { inngestTestEngine, InngestEvent } from '../../core/inngestTestEngine'
import { TestResult } from '../../types'
import { ModeEnum } from '@/types/modes'

export async function testInvoiceCreation(): Promise<TestResult> {
  try {
    logger.info('🚀 Starting invoice creation test')

    // Clear previous events
    await inngestTestEngine.clearEventHistory()

    // Send payment/create event
    await inngestTestEngine.send({
      name: 'payment/create',
      data: {
        telegram_id: '123456789',
        amount: 100,
        description: 'Test payment',
        bot_name: 'test_bot',
        service_type: ModeEnum.TopUpBalance,
      },
    })

    // Wait for events to process
    await inngestTestEngine.waitForEvents()

    // Get processed events
    const processedEvents = await inngestTestEngine.getProcessedEvents()

    // Verify invoice creation event was processed
    const invoiceEvent = processedEvents.find(
      (event: InngestEvent) =>
        event.name === 'payment/create' &&
        event.data.telegram_id === '123456789'
    )

    if (!invoiceEvent) {
      throw new Error('Invoice creation event was not processed')
    }

    logger.info('✅ Invoice creation test passed successfully')
    return {
      success: true,
      message: 'Invoice creation test passed successfully',
      name: 'Invoice Creation Test',
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    logger.error(`❌ Invoice creation test failed: ${errorMessage}`)
    return {
      success: false,
      message: `Invoice creation test failed: ${errorMessage}`,
      name: 'Invoice Creation Test',
    }
  }
}

// Run the test
if (require.main === module) {
  ;(async () => {
    const result = await testInvoiceCreation()
    console.log('Test result:', result)
    process.exit(result.success ? 0 : 1)
  })()
}
