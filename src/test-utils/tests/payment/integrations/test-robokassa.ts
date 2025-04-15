import { inngestTestEngine } from '../../../core/inngestTestEngine'
import { ModeEnum } from '@/types/modes'
import { logger } from '@/utils/logger'
import { TEST_CONFIG } from '../../../test-config'
import { TestResult } from '../../../types'
import { InngestEvent } from '@/types'

export async function testRobokassaInvoice(): Promise<TestResult> {
  try {
    logger.info('🚀 Starting Robokassa invoice test')

    // Clear previous events
    inngestTestEngine.clearEventHistory()

    // Generate unique invoice ID
    const invoiceId = `test-${Date.now()}`

    // Send payment creation event
    await inngestTestEngine.send({
      name: 'payment/create',
      data: {
        telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
        amount: 100,
        description: 'Test Robokassa payment',
        bot_name: 'test-bot',
        service_type: ModeEnum.TopUpBalance,
        invoice_id: invoiceId,
      },
    })

    // Wait for event processing
    const processedEvents: InngestEvent[] =
      await inngestTestEngine.waitForEvents()

    // Verify event processing
    const invoiceEvent = processedEvents.find(
      (event: InngestEvent) =>
        event.name === 'payment/create' && event.data.invoice_id === invoiceId
    )

    if (!invoiceEvent) {
      throw new Error('Invoice creation event was not processed')
    }

    logger.info('✅ Robokassa invoice test passed')
    return {
      success: true,
      message: 'Robokassa invoice test completed successfully',
      name: 'Robokassa Invoice Test',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('❌ Robokassa invoice test failed', { error: errorMessage })
    return {
      success: false,
      message: `Robokassa invoice test failed: ${errorMessage}`,
      name: 'Robokassa Invoice Test',
    }
  }
}

export async function testRobokassaIntegration(): Promise<TestResult> {
  try {
    logger.info('🚀 Starting Robokassa integration tests...')

    // Clear previous events
    await inngestTestEngine.clearEventHistory()

    // Send test payment event
    await inngestTestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: '123456789',
        amount: 100,
        description: 'Test Robokassa payment',
        bot_name: 'test_bot',
        service_type: ModeEnum.TopUpBalance,
      },
    })

    // Wait for event processing
    await inngestTestEngine.waitForEvents()

    // Get processed events
    const processedEvents = await inngestTestEngine.getProcessedEvents()

    // Verify event processing
    if (processedEvents.length === 0) {
      throw new Error('No events were processed')
    }

    logger.info('✅ Robokassa integration test completed successfully')

    return {
      success: true,
      message: 'Robokassa integration test passed',
      name: 'Robokassa Integration Test',
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    logger.error(`❌ Robokassa integration test failed: ${errorMessage}`)

    return {
      success: false,
      message: `Robokassa integration test failed: ${errorMessage}`,
      name: 'Robokassa Integration Test',
    }
  }
}
