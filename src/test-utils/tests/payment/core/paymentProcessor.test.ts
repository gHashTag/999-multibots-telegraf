import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { TEST_CONFIG } from '@/test-utils/test-config'
import { ModeEnum } from '@/interfaces/modes'
import { TransactionType } from '@/interfaces/payments.interface'

/**
 * Тест обработки платежа
 */
export async function testPaymentProcessing(): Promise<TestResult> {
  const testName = 'Тест обработки платежа'

  logger.info('🚀 Начинаю тест обработки платежа...', {
    description: 'Starting payment processing test',
  })

  try {
    const testPayment = {
      telegram_id: TEST_CONFIG.testUser.telegram_id,
      amount: TEST_CONFIG.amount,
      type: 'money_income' as TransactionType,
      description: TEST_CONFIG.description,
      bot_name: TEST_CONFIG.botName,
      service_type: ModeEnum.TopUpBalance,
    }

    await TEST_CONFIG.testEngine.sendEvent({
      name: 'payment/process',
      data: testPayment,
      timestamp: new Date(),
    })

    const events = await TEST_CONFIG.testEngine.getEvents()
    const processedEvent = events.find(
      event =>
        event.name === 'payment/process' &&
        typeof event.data === 'object' &&
        event.data !== null &&
        'telegram_id' in event.data &&
        event.data.telegram_id === testPayment.telegram_id
    )

    if (!processedEvent) {
      return {
        success: false,
        message: 'Payment event was not processed',
        name: testName,
      }
    }

    logger.info('✅ Тест успешно пройден', {
      description: 'Payment processing test passed',
      testName,
    })

    return {
      success: true,
      message: 'Payment was processed successfully',
      name: testName,
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте обработки платежа', {
      description: 'Error in payment processing test',
      error: error instanceof Error ? error.message : String(error),
      testName,
    })

    return {
      success: false,
      message:
        error instanceof Error ? error.message : 'Unknown error occurred',
      name: testName,
    }
  }
}

// Если файл запущен напрямую
if (require.main === module) {
  testPaymentProcessing()
    .then(result => {
      if (result.success) {
        logger.info(`✅ ${result.message}`)
      } else {
        logger.error(`❌ ${result.message}`)
      }
    })
    .catch(error => {
      logger.error(
        '❌ Критическая ошибка:',
        error instanceof Error ? error.message : 'Неизвестная ошибка'
      )
    })
}
