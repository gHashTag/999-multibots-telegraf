import { TestResult } from '../../../types'
import { inngestTestEngine } from '../../../core/inngestTestEngine'
import { ModeEnum } from '@/types/modes'
import { logger } from '@/utils/logger'

// Balance test
export async function testBalance(): Promise<TestResult> {
  try {
    logger.info('🚀 Starting balance test...')

    await inngestTestEngine.clearEventHistory()

    const testData = {
      telegram_id: '123456789',
      amount: 100,
      type: 'money_income',
      description: 'Test balance top-up',
      bot_name: 'test_bot',
      service_type: ModeEnum.TopUpBalance,
    }

    await inngestTestEngine.send({
      name: 'payment/process',
      data: testData,
    })

    const events = await inngestTestEngine.getProcessedEvents()

    if (!events.length) {
      throw new Error('Balance test event was not processed')
    }

    logger.info('✅ Balance test completed successfully')
    return {
      success: true,
      message: 'Balance test passed',
      name: 'Balance Test',
    }
  } catch (error) {
    logger.error(
      '❌ Balance test failed:',
      error instanceof Error ? error.message : String(error)
    )
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      name: 'Balance Test',
    }
  }
}

// Invoice test
export async function testInvoice(): Promise<TestResult> {
  try {
    logger.info('🚀 Starting invoice test...')

    await inngestTestEngine.clearEventHistory()

    const testData = {
      telegram_id: '123456789',
      amount: 100,
      type: 'money_income',
      description: 'Test invoice creation',
      bot_name: 'test_bot',
      service_type: ModeEnum.TopUpBalance,
      inv_id: 'TEST-123',
    }

    await inngestTestEngine.send({
      name: 'payment/process',
      data: testData,
    })

    const events = await inngestTestEngine.getProcessedEvents()

    if (!events.length) {
      throw new Error('Invoice test event was not processed')
    }

    logger.info('✅ Invoice test completed successfully')
    return {
      success: true,
      message: 'Invoice test passed',
      name: 'Invoice Test',
    }
  } catch (error) {
    logger.error(
      '❌ Invoice test failed:',
      error instanceof Error ? error.message : String(error)
    )
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      name: 'Invoice Test',
    }
  }
}

// Transaction test
export async function testTransaction(): Promise<TestResult> {
  try {
    logger.info('🚀 Starting transaction test...')

    await inngestTestEngine.clearEventHistory()

    const testData = {
      telegram_id: '123456789',
      amount: 100,
      type: 'money_income',
      description: 'Test transaction',
      bot_name: 'test_bot',
      service_type: ModeEnum.TopUpBalance,
    }

    await inngestTestEngine.send({
      name: 'payment/process',
      data: testData,
    })

    const events = await inngestTestEngine.getProcessedEvents()

    if (!events.length) {
      throw new Error('Transaction test event was not processed')
    }

    logger.info('✅ Transaction test completed successfully')
    return {
      success: true,
      message: 'Transaction test passed',
      name: 'Transaction Test',
    }
  } catch (error) {
    logger.error(
      '❌ Transaction test failed:',
      error instanceof Error ? error.message : String(error)
    )
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      name: 'Transaction Test',
    }
  }
}

export const paymentFeatureTests = {
  testBalance,
  testInvoice,
  testTransaction,
}
