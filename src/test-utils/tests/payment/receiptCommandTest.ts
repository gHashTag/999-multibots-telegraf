import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { TEST_CONFIG } from '@/test-utils/test-config'
import { MockTelegram } from '@/test-utils/mocks/telegrafMock'
import { createMockFn } from '@/test-utils/mocks/telegrafMock'
import { supabase } from '@/core/supabase'

/**
 * Тест обработки команды получения платежного чека
 *
 * @returns Результат выполнения теста
 */
export async function testReceiptCommand(): Promise<TestResult> {
  logger.info('🚀 Запуск теста команды платежного чека', {
    description: 'Starting receipt command test',
  })

  // Создаем мок-контекст
  const ctx = await createMockContext({
    userId: Number(TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID),
    firstName: TEST_CONFIG.TEST_DATA.TEST_USER_FIRST_NAME,
    lastName: TEST_CONFIG.TEST_DATA.TEST_USER_LAST_NAME,
    username: TEST_CONFIG.TEST_DATA.TEST_USER_USERNAME,
    messageText: `/receipt ${TEST_CONFIG.TEST_DATA.TEST_OPERATION_ID}`,
  })

  try {
    // Мок для supabase.from().select().eq().single()
    const mockSupabaseSelect = createMockFn().mockResolvedValue({
      data: {
        id: 1,
        operation_id: TEST_CONFIG.TEST_DATA.TEST_OPERATION_ID,
        telegram_id: Number(TEST_CONFIG.TEST_DATA.TEST_USER_TELEGRAM_ID),
        amount: TEST_CONFIG.TEST_DATA.TEST_AMOUNT,
        stars: TEST_CONFIG.TEST_DATA.TEST_STARS,
        type: 'money_income',
        description: 'Тестовый платеж',
        status: 'COMPLETED',
        bot_name: TEST_CONFIG.TEST_DATA.TEST_BOT_NAME,
        created_at: new Date().toISOString(),
      },
      error: null,
    })

    // Временно подменяем метод supabase.from
    const originalSupabaseFrom = supabase.from
    supabase.from = createMockFn().mockReturnValue({
      select: createMockFn().mockReturnValue({
        eq: createMockFn().mockReturnValue({
          single: mockSupabaseSelect,
        }),
      }),
    }) as any

    // Импортируем функцию обработчика команды
    const { handleReceiptCommand } = require('@/handlers/handleReceiptCommand')

    // Вызываем обработчик команды
    logger.info('🚀 Вызов обработчика команды receipt', {
      description: 'Calling receipt command handler',
    })
    await handleReceiptCommand(ctx)

    // Проверяем, что пользователю было отправлено сообщение с URL чека
    const telegram = ctx.telegram as unknown as MockTelegram
    const sentMessages = telegram.sentMessages

    // Проверяем, что сообщение с чеком было отправлено
    const receiptMessage = sentMessages.find(
      (msg: any) =>
        typeof msg.text === 'string' &&
        (msg.text.includes('🧾') ||
          msg.text.includes('Receipt') ||
          msg.text.includes('Чек'))
    )

    if (!receiptMessage) {
      throw new Error('Сообщение с чеком не было отправлено пользователю')
    }

    // Проверяем, что сообщение содержит кнопку с URL
    const hasInlineKeyboard =
      receiptMessage.options &&
      receiptMessage.options.reply_markup &&
      receiptMessage.options.reply_markup.inline_keyboard

    if (!hasInlineKeyboard) {
      throw new Error('Сообщение с чеком не содержит кнопку с URL')
    }

    // Восстанавливаем оригинальный метод supabase.from
    supabase.from = originalSupabaseFrom

    logger.info('✅ Тест команды платежного чека успешно завершен', {
      description: 'Receipt command test completed successfully',
    })

    return {
      success: true,
      name: 'testReceiptCommand',
      message: 'Тест команды платежного чека выполнен успешно',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка в тесте команды платежного чека', {
      description: 'Error in receipt command test',
      error: error.message,
      stack: error.stack,
    })

    return {
      success: false,
      name: 'testReceiptCommand',
      message: `Ошибка теста: ${error.message}`,
    }
  }
}
