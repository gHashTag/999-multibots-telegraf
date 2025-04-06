import { TelegramId } from '@/interfaces/telegram.interface'
import { inngest } from '@/inngest-functions/clients'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/core/supabase'

// Вспомогательные функции для генерации тестовых данных
const generateTestTelegramId = (): TelegramId => {
  return Date.now().toString()
}

const generateOperationId = (telegram_id: TelegramId): string => {
  return `${Date.now()}-${telegram_id}-${uuidv4()}`
}

const waitForPaymentCompletion = async (
  telegram_id: TelegramId,
  operation_id: string
) => {
  let attempts = 0
  const maxAttempts = 5 // Уменьшаем количество попыток с 20 до 5
  const delay = 1000 // 1 second

  while (attempts < maxAttempts) {
    attempts++

    // Проверяем запись в payments_v2
    const { data: payments, error: paymentError } = await supabase
      .from('payments_v2')
      .select('status, payment_id')
      .eq('telegram_id', telegram_id)
      .eq('inv_id', operation_id)
      .order('payment_date', { ascending: false })
      .limit(1)

    if (paymentError) {
      logger.error('❌ Ошибка при проверке статуса платежа', {
        description: 'Error checking payment status',
        error: paymentError.message,
        attempt: attempts,
        telegram_id,
        operation_id,
      })
      continue
    }

    const payment = payments?.[0]

    logger.info('🔄 Проверка статуса платежа', {
      description: 'Checking payment status',
      attempt: attempts,
      telegram_id,
      operation_id,
      payment_status: payment?.status || 'NOT_FOUND',
      payment_id: payment?.payment_id || 'NOT_FOUND',
    })

    if (!payment) {
      logger.error('❌ Платеж не найден', {
        description: 'Payment not found',
        operation_id,
        attempt: attempts,
        telegram_id,
      })
      await new Promise(resolve => setTimeout(resolve, delay))
      continue
    }

    if (payment.status === 'FAILED') {
      logger.error('❌ Платеж завершился с ошибкой', {
        description: 'Payment failed',
        operation_id,
        attempt: attempts,
        telegram_id,
      })
      return false
    }

    if (payment.status === 'COMPLETED') {
      logger.info('✅ Операция успешно завершена', {
        description: 'Operation completed successfully',
        operation_id,
        payment_id: payment.payment_id,
      })
      return true
    }

    await new Promise(resolve => setTimeout(resolve, delay))
  }

  logger.error('❌ Таймаут операции', {
    description: 'Operation timeout',
    operation_id,
    attempts,
  })
  return false
}

export const testInngestPayment = async () => {
  const telegram_id = generateTestTelegramId()
  const bot_name = 'test_bot'

  logger.info('🚀 Начало тестирования платежной системы', {
    description: 'Starting payment system test',
    telegram_id,
  })

  // Генерируем уникальный operation_id для пополнения
  const incomeOperationId = generateOperationId(telegram_id)

  // Отправляем событие пополнения
  await inngest.send({
    name: 'payment/process',
    data: {
      amount: 100,
      telegram_id,
      type: 'money_income',
      description: 'test money_income',
      bot_name,
      operation_id: incomeOperationId,
      metadata: {
        service_type: 'System',
        test: true,
      },
    },
  })

  // Ждем завершения операции пополнения
  const incomeResult = await waitForPaymentCompletion(
    telegram_id,
    incomeOperationId
  )

  if (!incomeResult) {
    logger.error('❌ Ошибка при пополнении баланса', {
      description: 'Error during money_income operation',
      telegram_id,
      operation_id: incomeOperationId,
    })
    process.exit(1)
  }

  // Проверяем баланс после пополнения
  const balanceAfterIncome = await getUserBalance(telegram_id, bot_name)
  if (Number(balanceAfterIncome) !== 100) {
    logger.error('❌ Некорректный баланс после пополнения', {
      description: 'Incorrect balance after money_income',
      telegram_id,
      expected: 100,
      actual: balanceAfterIncome,
    })
    process.exit(1)
  }

  // Генерируем уникальный operation_id для списания
  const spendOperationId = generateOperationId(telegram_id)

  // Отправляем событие списания
  await inngest.send({
    name: 'payment/process',
    data: {
      amount: -30,
      telegram_id,
      type: 'money_expense',
      description: 'test money_expense',
      bot_name,
      operation_id: spendOperationId,
      metadata: {
        service_type: 'System',
        test: true,
      },
    },
  })

  // Ждем завершения операции списания
  const spendResult = await waitForPaymentCompletion(
    telegram_id,
    spendOperationId
  )

  if (!spendResult) {
    logger.error('❌ Ошибка при списании средств', {
      description: 'Error during spend operation',
      telegram_id,
      operation_id: spendOperationId,
    })
    process.exit(1)
  }

  // Проверяем баланс после списания
  const finalBalance = await getUserBalance(telegram_id, bot_name)
  if (Number(finalBalance) !== 70) {
    logger.error('❌ Некорректный финальный баланс', {
      description: 'Incorrect final balance',
      telegram_id,
      expected: 70,
      actual: finalBalance,
    })
    process.exit(1)
  }

  logger.info('✅ Тест платежной системы успешно завершен', {
    description: 'Payment system test completed successfully',
    telegram_id,
    final_balance: finalBalance,
  })

  process.exit(0)
}
