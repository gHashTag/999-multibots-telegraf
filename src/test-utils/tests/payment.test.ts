import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'
import { inngest } from '@/core/inngest/clients'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'
import { TestResult } from '../types'
import { getPaymentByInvId } from '@/core/supabase/getPaymentByInvId'

const waitForPaymentCompletion = async (
  telegram_id: TelegramId,
  operation_id: string,
  expectedBalance: number
): Promise<boolean> => {
  let attempts = 0
  const maxAttempts = 5 // Уменьшаем количество попыток
  const delay = 1000 // 1 second

  while (attempts < maxAttempts) {
    try {
      // Проверяем запись в payments_v2
      const payment = await getPaymentByInvId(operation_id)

      // Проверяем текущий баланс
      const currentBalance = await getUserBalance(telegram_id)

      logger.info('🔄 Проверка статуса платежа', {
        description: 'Checking payment status',
        attempt: attempts + 1,
        telegram_id,
        operation_id,
        payment_status: payment?.status || 'NOT_FOUND',
        current_balance: currentBalance,
        expected_balance: expectedBalance,
      })

      if (
        payment?.status === 'COMPLETED' &&
        currentBalance === expectedBalance
      ) {
        logger.info('✅ Платеж успешно завершен', {
          description: 'Payment completed successfully',
          telegram_id,
          operation_id,
          current_balance: currentBalance,
          expected_balance: expectedBalance,
        })
        return true
      }

      if (payment?.status === 'FAILED') {
        logger.error('❌ Платеж завершился с ошибкой', {
          description: 'Payment failed',
          telegram_id,
          operation_id,
          current_balance: currentBalance,
        })
        return false
      }

      attempts++
      await new Promise(resolve => setTimeout(resolve, delay))
    } catch (error) {
      logger.error('❌ Ошибка при проверке статуса платежа', {
        description: 'Error checking payment status',
        error: error instanceof Error ? error.message : String(error),
        attempt: attempts + 1,
        telegram_id,
        operation_id,
      })
      attempts++
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  logger.error('❌ Таймаут операции', {
    description: 'Operation timeout',
    operation_id,
    attempts,
  })
  return false
}

/**
 * Очищает тестовые данные пользователя
 */
const cleanupTestUser = async (telegram_id: TelegramId) => {
  try {
    // Удаляем платежи
    await supabase.from('payments_v2').delete().eq('telegram_id', telegram_id)
    // Удаляем пользователя
    await supabase.from('users').delete().eq('telegram_id', telegram_id)

    logger.info('🧹 Тестовые данные очищены', {
      description: 'Test data cleaned up',
      telegram_id,
    })
  } catch (error) {
    logger.error('❌ Ошибка при очистке тестовых данных', {
      description: 'Error cleaning up test data',
      error: error instanceof Error ? error.message : String(error),
      telegram_id,
    })
  }
}

export const testPaymentSystem = async (): Promise<TestResult> => {
  const testTelegramId = normalizeTelegramId(Date.now())
  const testUsername = `test_user_${testTelegramId}`

  try {
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

    // Тест 1: Проверка начального баланса
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

    // Тест 2: Пополнение баланса (STARS)
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
        currency: 'STARS',
      },
    })

    // Добавляем задержку для обработки события
    await new Promise(resolve => setTimeout(resolve, 5000))

    const addOperationCompleted = await waitForPaymentCompletion(
      testTelegramId,
      addOperationId,
      100
    )

    if (!addOperationCompleted) {
      throw new Error('Операция пополнения не завершилась успешно')
    }

    const balanceAfterAdd = await getUserBalance(testTelegramId)
    if (balanceAfterAdd !== 100) {
      throw new Error(
        `Баланс после пополнения должен быть 100, получено: ${balanceAfterAdd}`
      )
    }

    // Тест 3: Списание средств
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
        currency: 'STARS',
      },
    })

    const spendOperationCompleted = await waitForPaymentCompletion(
      testTelegramId,
      spendOperationId,
      70
    )

    if (!spendOperationCompleted) {
      throw new Error('Операция списания не завершилась успешно')
    }

    // Тест 4: Проверка на отрицательный баланс
    const negativeOperationId = `${Date.now()}-${testTelegramId}-${uuidv4()}`
    await inngest.send({
      id: `test-payment-negative-${negativeOperationId}`,
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 100,
        is_ru: true,
        bot_name: 'test_bot',
        description: 'Test negative balance prevention',
        type: 'outcome',
        metadata: {
          service_type: ModeEnum.TextToImage,
          test: true,
        },
        operation_id: negativeOperationId,
        currency: 'STARS',
      },
    })

    // Ждем обработки операции
    await new Promise(resolve => setTimeout(resolve, 5000))

    const balanceAfterNegative = await getUserBalance(testTelegramId)
    if (balanceAfterNegative !== 70) {
      throw new Error(
        `Баланс не должен уйти в минус, ожидается 70, получено: ${balanceAfterNegative}`
      )
    }

    // Тест 5: Конкурентные операции
    const concurrentOperations = Array.from({ length: 5 }, (_, i) => {
      const operationId = `${Date.now()}-${testTelegramId}-concurrent-${i}`
      return inngest.send({
        id: `test-payment-concurrent-${operationId}`,
        name: 'payment/process',
        data: {
          telegram_id: testTelegramId,
          amount: 10,
          is_ru: true,
          bot_name: 'test_bot',
          description: `Concurrent operation ${i}`,
          type: 'income',
          metadata: {
            service_type: 'System',
            test: true,
            concurrent_test: true,
          },
          operation_id: operationId,
          currency: 'STARS',
        },
      })
    })

    await Promise.all(concurrentOperations)
    await new Promise(resolve => setTimeout(resolve, 5000))

    const finalBalance = await getUserBalance(testTelegramId)
    if (finalBalance !== 120) {
      // 70 + (5 * 10)
      throw new Error(
        `Неверный баланс после конкурентных операций, ожидается 120, получено: ${finalBalance}`
      )
    }

    // Тест 6: Проверка записей в таблице payments_v2
    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select(
        'amount, stars, payment_method, status, description, metadata, inv_id, currency'
      )
      .eq('telegram_id', testTelegramId)
      .order('payment_date', { ascending: false })

    if (error) {
      throw new Error(`Ошибка при получении платежей: ${error.message}`)
    }

    if (!payments || payments.length === 0) {
      throw new Error('Не найдены записи о платежах')
    }

    logger.info('✅ Тесты платежной системы успешно завершены', {
      description: 'Payment system tests completed successfully',
      telegram_id: testTelegramId,
      final_balance: finalBalance,
      payments_count: payments.length,
    })

    return {
      success: true,
      testName: 'Payment System Test',
      message: 'Все тесты платежной системы успешно пройдены',
      details: {
        telegram_id: testTelegramId,
        final_balance: finalBalance,
        payments_count: payments.length,
      },
    }
  } catch (error) {
    logger.error('❌ Ошибка в тестах платежной системы', {
      description: 'Error in payment system tests',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: testTelegramId,
    })

    return {
      success: false,
      testName: 'Payment System Test',
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    // Очищаем тестовые данные
    await cleanupTestUser(testTelegramId)
  }
}
