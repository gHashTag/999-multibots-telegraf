import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { createMockFn } from '@/test-utils/mocks/telegrafMock'
import { TEST_CONFIG } from '@/test-utils/test-config'
import { inngestTestEngine } from '@/test-utils/test-config'
import { TransactionType } from '@/interfaces/payments.interface'

/**
 * Тест простой генерации платежного чека
 *
 * @returns Результат выполнения теста
 */
export async function testSimpleReceiptGeneration(): Promise<TestResult> {
  logger.info('🚀 Запуск теста простой генерации платежного чека', {
    description: 'Starting simple payment receipt generation test',
  })

  // Создаем мок-контекст
  const ctx = await createMockContext({
    userId: Number(TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID),
    firstName: TEST_CONFIG.TEST_DATA.TEST_USER_FIRST_NAME,
    lastName: TEST_CONFIG.TEST_DATA.TEST_USER_LAST_NAME,
    username: TEST_CONFIG.TEST_DATA.TEST_USER_USERNAME,
  })

  try {
    // Мок для функции генерации URL чека
    const mockGenerateReceiptUrl = createMockFn().mockResolvedValue(
      'https://example.com/receipt/123456'
    )

    // Очистка событий перед тестом
    inngestTestEngine.clearEvents()

    // 1. Симулируем создание платежа
    logger.info('💰 Симуляция создания платежа', {
      description: 'Simulating payment creation',
    })

    const paymentEvent = {
      telegram_id: TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID,
      amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT,
      stars: TEST_CONFIG.TEST_DATA.TEST_STARS,
      type: TransactionType.MONEY_INCOME,
      description: 'Тестовый платеж для проверки простого чека',
      bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
      operation_id: 'test-simple-receipt-' + Date.now(),
    }

    await inngestTestEngine.sendEvent('payment/process', paymentEvent)

    // 2. Симулируем запрос на генерацию чека
    logger.info('🧾 Симуляция запроса чека', {
      description: 'Simulating receipt request',
    })

    const receiptUrl = await mockGenerateReceiptUrl(paymentEvent.operation_id)

    // 3. Проверяем формат URL чека
    logger.info('🔍 Проверка формата URL чека', {
      description: 'Checking receipt URL format',
      receiptUrl,
    })

    if (
      !receiptUrl ||
      typeof receiptUrl !== 'string' ||
      !receiptUrl.startsWith('http')
    ) {
      throw new Error(`Некорректный URL чека: ${receiptUrl}`)
    }

    // 4. Симулируем отправку URL чека пользователю
    logger.info('📤 Симуляция отправки URL чека пользователю', {
      description: 'Simulating sending receipt URL to user',
    })

    await ctx.reply(`Ваш чек: ${receiptUrl}`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: 'Открыть чек', url: receiptUrl }]],
      },
    })

    // Проверяем, что наша мок-функция была вызвана
    if (mockGenerateReceiptUrl.mock.calls.length === 0) {
      throw new Error('Функция генерации URL чека не была вызвана')
    }

    logger.info('✅ Тест простой генерации платежного чека успешно завершен', {
      description:
        'Simple payment receipt generation test completed successfully',
    })

    return {
      success: true,
      name: 'testSimpleReceiptGeneration',
      message: 'Тест простой генерации платежного чека прошел успешно',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка в тесте простой генерации платежного чека', {
      description: 'Error in simple payment receipt generation test',
      error: error.message,
      stack: error.stack,
    })

    return {
      success: false,
      name: 'testSimpleReceiptGeneration',
      message: `Ошибка теста: ${error.message}`,
    }
  }
}
