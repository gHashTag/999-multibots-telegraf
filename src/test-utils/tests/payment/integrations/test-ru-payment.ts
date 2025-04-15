import { logger } from '@/utils/logger'
import { TestResult } from '@/test-utils/types'
import { TEST_CONFIG } from '@/test-utils/test-config'
import { ModeEnum } from '@/interfaces/modes'
import { TransactionType } from '@/interfaces/payments.interface'

/**
 * Тест RuPayment интеграции
 */
export async function testRuPaymentIntegration(): Promise<TestResult> {
  logger.info('🚀 Запуск тестов RuPayment...')

  try {
    await TEST_CONFIG.testEngine.clearEvents()

    // Тестовые данные
    const testPayment = {
      name: 'payment/process',
      data: {
        amount: TEST_CONFIG.amount,
        telegram_id: TEST_CONFIG.testUser.telegram_id,
        type: TransactionType.MONEY_INCOME,
        description: TEST_CONFIG.description,
        bot_name: TEST_CONFIG.botName,
        service_type: ModeEnum.TopUpBalance,
      },
    }

    // Отправляем тестовое событие
    await TEST_CONFIG.testEngine.sendEvent(testPayment)

    // Ждем обработки события
    const processedEvents = await TEST_CONFIG.testEngine.getEvents()

    if (processedEvents.length === 0) {
      throw new Error('Событие не было обработано')
    }

    logger.info('✅ Тест RuPayment успешно пройден')
    return {
      success: true,
      name: 'RuPayment Integration Test',
      message: 'Тест успешно пройден',
    }
  } catch (error) {
    logger.error('❌ Ошибка теста RuPayment:', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'RuPayment Integration Test',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
