import { logger } from '@/utils/logger'
import { TestResult } from '../../../types'
import { inngestTestEngine } from '../../../core/inngestTestEngine'
import { ModeEnum } from '@/types/modes'

/**
 * Тест RuPayment интеграции
 */
export async function testRuPayment(): Promise<TestResult> {
  logger.info('🚀 Запуск тестов RuPayment...')

  try {
    await inngestTestEngine.clearEventHistory()

    // Тестовые данные
    const testPayment = {
      name: 'payment/process',
      data: {
        amount: 100,
        telegram_id: '123456789',
        type: 'money_income',
        description: 'Test RuPayment',
        bot_name: 'test_bot',
        service_type: ModeEnum.TopUpBalance,
      },
    }

    // Отправляем тестовое событие
    await inngestTestEngine.send(testPayment)

    // Ждем обработки события
    const processedEvents = await inngestTestEngine.waitForEvents()

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
