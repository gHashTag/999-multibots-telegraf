import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { generateInvId } from '@/utils/generateInvId'
import { TEST_CONFIG } from './test-config'

const runRuPaymentTest = async () => {
  try {
    logger.info('🚀 Запуск тестирования русских платежей через Inngest', {
      description: 'Starting RU payment system testing via Inngest',
    })

    const telegram_id = Date.now().toString()
    const amount = 500 // Тестовая сумма в рублях
    const operation_id = generateInvId(telegram_id, amount)

    // Отправляем тестовое событие
    await inngest.send({
      name: 'ru-payment/process-payment',
      data: {
        IncSum: amount,
        inv_id: operation_id,
        telegram_id,
        bot_name: 'test_bot',
        description: 'test ru payment',
        metadata: {
          service_type: 'System',
          test: true,
        },
      },
    })

    logger.info('✅ Тестовое событие отправлено', {
      description: 'Test event sent',
      telegram_id,
      operation_id,
    })

    // Ждем и проверяем статус платежа
    let attempts = 0
    const maxAttempts = 5
    const checkInterval = TEST_CONFIG.CHECK_INTERVAL

    while (attempts < maxAttempts) {
      attempts++

      logger.info('🔄 Проверка статуса платежа', {
        description: 'Checking payment status',
        attempt: attempts,
        telegram_id,
        operation_id,
      })

      // Здесь должна быть проверка статуса платежа в БД
      // Для демонстрации просто логируем попытку
      logger.info('❌ Платеж не найден', {
        description: 'Payment not found',
        operation_id,
        attempt: attempts,
        telegram_id,
      })

      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, checkInterval))
      }
    }

    logger.info('❌ Таймаут операции', {
      description: 'Operation timeout',
      operation_id,
      attempts,
    })

    logger.error('❌ Ошибка при пополнении баланса', {
      description: 'Error during money_income operation',
      telegram_id,
      operation_id,
    })
  } catch (error) {
    logger.error('❌ Ошибка в тесте русских платежей', {
      description: 'Error in RU payment test',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}

runRuPaymentTest().catch(console.error)
