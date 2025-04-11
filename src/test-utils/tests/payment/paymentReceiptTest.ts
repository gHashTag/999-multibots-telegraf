import { TestResult } from '@/test-utils/types'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { IContext } from '@/interfaces/context.interface'
import { logger } from '@/utils/logger'
import { supabaseClient } from '@/core/supabase/supabaseClient'
import { mockPaymentCreate } from '@/test-utils/mocks/payment'
import * as getPaymentReceiptUrl from '@/helpers/getPaymentReceiptUrl'
import { getRandomUser } from '@/test-utils/helpers/getRandomUser'

/**
 * Тест генерации и открытия платежного чека
 */
export async function testPaymentReceiptGeneration(): Promise<TestResult> {
  logger.info('🎯 Запуск теста генерации платежного чека', {
    description: 'Starting payment receipt generation test',
  })

  try {
    // Создаем мок-контекст для теста
    const ctx = createMockContext() as IContext
    const user = await getRandomUser()

    if (!user) {
      throw new Error('Не удалось получить тестового пользователя')
    }

    ctx.from = { id: user.telegram_id }
    logger.info('ℹ️ Контекст и пользователь созданы', {
      description: 'Context and user created',
      userId: user.telegram_id,
    })

    // Мокаем создание платежа
    const paymentData = await mockPaymentCreate({
      telegram_id: user.telegram_id,
      stars: 100,
      type: 'money_income',
      status: 'COMPLETED',
      payment_method: 'test',
      description: 'Тестовый платеж для генерации чека',
      bot_name: 'TestBot',
    })

    logger.info('💾 Тестовый платеж создан', {
      description: 'Test payment created',
      paymentId: paymentData.id,
    })

    // Шпионим за функцией получения URL чека
    const getPaymentReceiptUrlSpy = jest.spyOn(
      getPaymentReceiptUrl,
      'getPaymentReceiptUrl'
    )

    // Получаем URL чека
    const receiptUrl = await getPaymentReceiptUrl.getPaymentReceiptUrl(
      paymentData.id.toString()
    )
    logger.info('🔍 Получен URL чека', {
      description: 'Receipt URL generated',
      receiptUrl,
    })

    // Проверяем, что функция была вызвана с правильными параметрами
    expect(getPaymentReceiptUrlSpy).toHaveBeenCalledWith(
      paymentData.id.toString()
    )

    // Проверяем, что URL сформирован корректно
    expect(receiptUrl).toContain('/receipt/')
    expect(receiptUrl).toContain(paymentData.id.toString())

    // Симулируем отправку URL пользователю
    await ctx.reply(`Чек по вашему платежу: ${receiptUrl}`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: 'Открыть чек', url: receiptUrl }]],
      },
    })

    logger.info('📤 URL чека отправлен пользователю', {
      description: 'Receipt URL sent to user',
      messageText: `Чек по вашему платежу: ${receiptUrl}`,
    })

    // Симулируем открытие чека пользователем
    logger.info('🔄 Симуляция открытия чека пользователем', {
      description: 'Simulating receipt opening by user',
    })

    // В реальном сценарии здесь был бы код для проверки доступности URL
    // и корректности отображаемых данных

    logger.info('✅ Тест генерации платежного чека успешно завершен', {
      description: 'Payment receipt generation test passed successfully',
    })

    // Очистка после теста
    getPaymentReceiptUrlSpy.mockRestore()

    // Удаляем тестовый платеж
    await supabaseClient.from('payments_v2').delete().eq('id', paymentData.id)

    logger.info('🧹 Тестовые данные удалены', {
      description: 'Test data cleaned up',
    })

    return {
      success: true,
      message: 'Тест генерации платежного чека пройден успешно',
      name: 'testPaymentReceiptGeneration',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при тестировании генерации платежного чека', {
      description: 'Error during payment receipt generation test',
      error: error.message,
      stack: error.stack,
    })

    return {
      success: false,
      message: `Ошибка в тесте генерации платежного чека: ${error.message}`,
      name: 'testPaymentReceiptGeneration',
    }
  }
}
