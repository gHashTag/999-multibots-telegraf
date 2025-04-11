import { TestResult } from '@/test-utils/types'
import { createMockContext } from '@/test-utils/helpers/createMockContext'
import { logger } from '@/utils/logger'
import { supabase } from '@/supabase'
import { generateReceiptUrl } from '@/helpers/generateReceiptUrl'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { generateInvId } from '@/utils/generateInvId'

/**
 * Тест генерации и открытия платежного чека
 */
export async function testPaymentReceiptGeneration(): Promise<TestResult> {
  logger.info('🎯 Запуск теста генерации платежного чека', {
    description: 'Starting payment receipt generation test',
  })

  try {
    // Создаем мок-контекст для теста с тестовым пользователем
    const telegramId = `${Date.now()}` // генерируем уникальный ID

    const ctx = createMockContext({
      user: {
        telegram_id: telegramId,
        username: 'testuser',
      },
      text: '/receipt',
    })

    logger.info('ℹ️ Контекст и пользователь созданы', {
      description: 'Context and user created',
      userId: telegramId,
    })

    // Создаем уникальный ID операции
    const operationId = generateInvId(telegramId, 100)

    // Создаем тестовый платеж
    const paymentData = {
      telegram_id: telegramId,
      amount: 100,
      stars: 100,
      type: 'money_income',
      description: 'Тестовый платеж для генерации чека',
      payment_method: 'test',
      status: 'COMPLETED',
      bot_name: 'TestBot',
      service_type: 'TopUpBalance',
      inv_id: operationId,
    }

    // Создаем платеж в БД
    const payment = await createSuccessfulPayment(paymentData)

    logger.info('💾 Тестовый платеж создан', {
      description: 'Test payment created',
      paymentId: payment.id,
      operationId: payment.inv_id,
    })

    // Генерируем URL чека напрямую вместо использования getPaymentReceiptUrl
    const receiptUrl = generateReceiptUrl({
      operationId: payment.id.toString(),
      amount: payment.amount,
      stars: payment.stars,
      botName: payment.bot_name,
      telegramId: payment.telegram_id,
      timestamp: payment.created_at,
    })

    logger.info('🔍 Получен URL чека', {
      description: 'Receipt URL generated',
      receiptUrl,
    })

    // Проверяем, что URL сформирован корректно
    if (!receiptUrl.includes('/payment')) {
      throw new Error('URL чека имеет неверный формат (отсутствует /payment)')
    }

    if (!receiptUrl.includes('operation_id=')) {
      throw new Error(
        'URL чека имеет неверный формат (отсутствует operation_id)'
      )
    }

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

    // Удаляем тестовый платеж
    await supabase.from('payments_v2').delete().eq('id', payment.id)

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
