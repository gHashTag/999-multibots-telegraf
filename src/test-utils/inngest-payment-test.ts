import { TelegramId } from '@/interfaces/telegram.interface';
import { inngest } from '@/core/inngest/clients'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'

const waitForPaymentCompletion = async (
  telegram_id: TelegramId,
  operation_id: string,
  expectedBalance: number
) => {
  let attempts = 0
  const maxAttempts = 10
  const delay = 1000 // 1 second

  while (attempts < maxAttempts) {
    // Проверяем запись в payments_v2
    const { data: payment } = await supabase
      .from('payments_v2')
      .select('status')
      .eq('telegram_id', telegram_id)
      .eq('inv_id', operation_id)
      .single()

    logger.info('🔄 Проверка статуса операции', {
      description: 'Checking operation status',
      attempt: attempts + 1,
      payment_status: payment?.status,
      operation_id,
    })

    if (payment?.status === 'COMPLETED') {
      logger.info('✅ Операция успешно завершена', {
        description: 'Operation completed successfully',
        operation_id,
      })
      return true
    }

    await new Promise(resolve => setTimeout(resolve, delay))
    attempts++
  }

  logger.error('❌ Таймаут операции', {
    description: 'Operation timeout',
    operation_id,
    attempts,
  })
  return false
}

export const testInngestPayment = async () => {
  try {
    const testTelegramId = Date.now()
    logger.info('🚀 Начало тестирования Inngest функции обработки платежей', {
      description: 'Starting Inngest payment function test',
      telegram_id: testTelegramId,
    })

    // Создаем тестового пользователя
    const { error: createUserError } = await supabase.from('users').insert([
      {
        telegram_id: testTelegramId.toString(),
        username: 'test_user',
        first_name: 'Test',
        last_name: 'User',
        is_bot: false,
        language_code: 'ru',
        photo_url: '',
        chat_id: testTelegramId,
        mode: 'clean',
        model: 'gpt-4-turbo',
        count: 0,
        aspect_ratio: '9:16',
        balance: 0,
        bot_name: 'test_bot',
        level: 1,
      },
    ])

    if (createUserError) {
      throw new Error(`Failed to create test user: ${createUserError.message}`)
    }

    logger.info('👤 Создан тестовый пользователь', {
      description: 'Test user created',
      telegram_id: testTelegramId,
    })

    // Шаг 1: Проверяем начальный баланс
    const initialBalance = await getUserBalance(testTelegramId)
    logger.info('💰 Начальный баланс', {
      description: 'Initial balance check',
      telegram_id: testTelegramId,
      balance: initialBalance,
    })

    // Шаг 2: Отправляем событие для пополнения баланса
    const addOperationId = `${Date.now()}-${testTelegramId}-${uuidv4()}`
    await inngest.send({
      id: `test-payment-add-${addOperationId}`,
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 100,
        is_ru: true,
        bot_name: 'test_bot',
        description: 'Test add payment via Inngest',
        type: 'income',
        metadata: {
          service_type: 'System',
          test: true,
        },
        operation_id: addOperationId,
      },
    })

    // Ждем завершения первой операции
    logger.info('⏳ Ожидание завершения операции пополнения', {
      description: 'Waiting for add operation completion',
      operation_id: addOperationId,
    })

    const addOperationCompleted = await waitForPaymentCompletion(
      testTelegramId,
      addOperationId,
      100 // Ожидаемый баланс после пополнения
    )
    if (!addOperationCompleted) {
      throw new Error('Add operation timeout')
    }

    // Шаг 3: Проверяем баланс после пополнения
    const balanceAfterAdd = await getUserBalance(testTelegramId)
    logger.info('💰 Баланс после пополнения', {
      description: 'Balance after adding payment',
      telegram_id: testTelegramId,
      balance: balanceAfterAdd,
      expected: 100,
    })

    // Шаг 4: Отправляем событие для списания средств
    const spendOperationId = `${Date.now()}-${testTelegramId}-${uuidv4()}`
    await inngest.send({
      id: `test-payment-spend-${spendOperationId}`,
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 30,
        is_ru: true,
        bot_name: 'test_bot',
        description: 'Test spend payment via Inngest',
        type: 'outcome',
        metadata: {
          service_type: ModeEnum.TextToImage,
          test: true,
        },
        operation_id: spendOperationId,
      },
    })

    // Ждем завершения второй операции
    logger.info('⏳ Ожидание завершения операции списания', {
      description: 'Waiting for spend operation completion',
      operation_id: spendOperationId,
    })

    const spendOperationCompleted = await waitForPaymentCompletion(
      testTelegramId,
      spendOperationId,
      70 // Ожидаемый баланс после списания
    )
    if (!spendOperationCompleted) {
      throw new Error('Spend operation timeout')
    }

    // Шаг 5: Проверяем финальный баланс
    const finalBalance = await getUserBalance(testTelegramId)
    logger.info('💰 Финальный баланс', {
      description: 'Final balance check',
      telegram_id: testTelegramId,
      balance: finalBalance,
      expected: 70,
    })

    // Шаг 6: Проверяем записи в таблице payments_v2
    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select(
        'amount, stars, payment_method, status, description, metadata, inv_id'
      )
      .eq('telegram_id', testTelegramId)
      .order('payment_date', { ascending: false })

    if (error) {
      throw error
    }

    logger.info('📊 Записи в таблице payments_v2', {
      description: 'Payments records',
      telegram_id: testTelegramId,
      payments,
    })

    // Проверяем результаты
    const testsPassed =
      initialBalance === 0 &&
      balanceAfterAdd === 100 &&
      finalBalance === 70 &&
      payments.length === 2 &&
      payments.every(p => p.status === 'COMPLETED') &&
      payments.some(p => p.inv_id === addOperationId) &&
      payments.some(p => p.inv_id === spendOperationId)

    logger.info(
      testsPassed ? '✅ Все тесты пройдены' : '❌ Некоторые тесты не пройдены',
      {
        description: testsPassed
          ? 'All tests passed successfully'
          : 'Some tests failed',
        telegram_id: testTelegramId,
        initialBalance,
        balanceAfterAdd,
        finalBalance,
        paymentsCount: payments.length,
      }
    )

    // Очищаем тестовые данные
    await supabase
      .from('payments_v2')
      .delete()
      .eq('telegram_id', testTelegramId.toString())
    await supabase
      .from('users')
      .delete()
      .eq('telegram_id', testTelegramId.toString())

    logger.info('🧹 Тестовые данные очищены', {
      description: 'Test data cleaned up',
      telegram_id: testTelegramId,
    })

    return testsPassed
  } catch (error) {
    logger.error('❌ Ошибка при тестировании:', {
      description: 'Error during testing',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}
