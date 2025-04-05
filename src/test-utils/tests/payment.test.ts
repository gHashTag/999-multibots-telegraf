import { TelegramId } from '@/interfaces/telegram.interface';
import { inngest } from '@/core/inngest/clients'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'
import { TestResult } from '../types'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'

const waitForPaymentCompletion = async (
  telegram_id: TelegramId,
  operation_id: string,
  expectedBalance: number
): Promise<boolean> => {
  let attempts = 0
  const maxAttempts = 20
  const delay = 1000 // 1 second

  while (attempts < maxAttempts) {
    // Проверяем запись в payments_v2
    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select('status')
      .eq('telegram_id', telegram_id)
      .eq('inv_id', operation_id)

    if (error) {
      logger.error('❌ Ошибка при проверке статуса платежа', {
        description: 'Error checking payment status',
        error: error.message,
        telegram_id,
        operation_id,
      })
      return false
    }

    if (!payments || payments.length === 0) {
      logger.info('🔄 Платеж еще не создан', {
        description: 'Payment not created yet',
        attempt: attempts + 1,
        telegram_id,
        operation_id,
      })
    } else {
      const payment = payments[0] // Берем первый платеж, если их несколько

      logger.info('🔄 Проверка статуса операции', {
        description: 'Checking operation status',
        attempt: attempts + 1,
        payment_status: payment?.status,
        operation_id,
        payments_found: payments.length,
      })

      if (payment?.status === 'COMPLETED') {
        logger.info('✅ Операция успешно завершена', {
          description: 'Operation completed successfully',
          operation_id,
        })
        return true
      }
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

export const testPaymentSystem = async (): Promise<TestResult> => {
  try {
    const testTelegramId = normalizeTelegramId(Date.now())
    const testUsername = `test_user_${testTelegramId}`

    logger.info('🚀 Начало тестирования платежной системы', {
      description: 'Starting payment system test',
      telegram_id: testTelegramId,
      username: testUsername,
    })

    // Создаем тестового пользователя
    const { error: createUserError } = await supabase.from('users').insert([
      {
        telegram_id: testTelegramId,
        username: testUsername,
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
      throw new Error(
        `Ошибка создания пользователя: ${createUserError.message}`
      )
    }

    logger.info('👤 Создан тестовый пользователь', {
      description: 'Test user created',
      telegram_id: testTelegramId,
      username: testUsername,
    })

    // Шаг 1: Проверяем начальный баланс
    const initialBalance = await getUserBalance(testTelegramId)
    logger.info('💰 Начальный баланс', {
      description: 'Initial balance check',
      telegram_id: testTelegramId,
      balance: initialBalance,
    })

    if (initialBalance !== 0) {
      throw new Error(
        `Начальный баланс должен быть 0, получено: ${initialBalance}`
      )
    }

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
      100
    )

    if (!addOperationCompleted) {
      throw new Error('Операция пополнения не завершилась успешно')
    }

    // Шаг 3: Проверяем баланс после пополнения
    const balanceAfterAdd = await getUserBalance(testTelegramId)
    logger.info('💰 Баланс после пополнения', {
      description: 'Balance after adding payment',
      telegram_id: testTelegramId,
      balance: balanceAfterAdd,
      expected: 100,
    })

    if (balanceAfterAdd !== 100) {
      throw new Error(
        `Баланс после пополнения должен быть 100, получено: ${balanceAfterAdd}`
      )
    }

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
      70
    )

    if (!spendOperationCompleted) {
      throw new Error('Операция списания не завершилась успешно')
    }

    // Шаг 5: Проверяем финальный баланс
    const finalBalance = await getUserBalance(testTelegramId)
    logger.info('💰 Финальный баланс', {
      description: 'Final balance check',
      telegram_id: testTelegramId,
      balance: finalBalance,
      expected: 70,
    })

    if (finalBalance !== 70) {
      throw new Error(
        `Финальный баланс должен быть 70, получено: ${finalBalance}`
      )
    }

    // Шаг 6: Проверяем записи в таблице payments_v2
    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select(
        'amount, stars, payment_method, status, description, metadata, inv_id'
      )
      .eq('telegram_id', testTelegramId)
      .order('payment_date', { ascending: false })

    if (error) {
      throw new Error(`Ошибка при получении платежей: ${error.message}`)
    }

    if (!payments || payments.length !== 2) {
      throw new Error(`Ожидалось 2 платежа, получено: ${payments?.length ?? 0}`)
    }

    if (
      payments[0].status !== 'COMPLETED' ||
      payments[1].status !== 'COMPLETED'
    ) {
      throw new Error('Не все платежи имеют статус COMPLETED')
    }

    logger.info('✅ Тест платежной системы успешно завершен', {
      description: 'Payment system test completed successfully',
      telegram_id: testTelegramId,
    })

    return {
      success: true,
      message: 'Тест платежной системы успешно завершен',
      testName: 'payment-system',
    }
  } catch (err) {
    const error = err as Error
    logger.error('❌ Ошибка в тесте платежной системы:', {
      description: 'Payment system test failed',
      error: error.message,
    })

    return {
      success: false,
      message: `Тест платежной системы завершился с ошибкой: ${error.message}`,
      testName: 'payment-system',
    }
  }
}
