<<<<<<< Updated upstream
=======
import { v4 as uuid } from 'uuid'
import { inngest } from '@/inngest-functions/clients'
>>>>>>> Stashed changes
import { logger } from '@/utils/logger'
import { TestResult } from '../types'
import { TEST_CONFIG } from '../test-config'
import { supabase } from '@/core/supabase'
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
import { MyContext } from '@/interfaces'
import { getUserBalance } from '@/core/supabase'
>>>>>>> Stashed changes

import { getUserBalance } from '@/core/supabase'

export const runBalanceTests = async (): Promise<TestResult[]> => {
  const results: TestResult[] = []
  const { TEST_BOT_NAME, TEST_OWNER_ID } = TEST_CONFIG

  try {
    logger.info('🎯 Начало тестирования баланса', {
      description: 'Starting balance tests',
      test_bot: TEST_BOT_NAME,
    })

    // Очищаем тестовые данные
    const { error: deletePaymentsError } = await supabase
      .from('payments_v2')
      .delete()
      .eq('bot_name', TEST_BOT_NAME)
      .eq('telegram_id', String(TEST_OWNER_ID))

    if (deletePaymentsError) {
      logger.error('❌ Ошибка при очистке тестовых платежей', {
        description: 'Error cleaning test payments',
        error: deletePaymentsError.message,
        details: deletePaymentsError,
      })
      throw deletePaymentsError
    }

    const { error: deleteUserError } = await supabase
      .from('users')
      .delete()
      .eq('bot_name', TEST_BOT_NAME)
      .eq('telegram_id', String(TEST_OWNER_ID))

    if (deleteUserError) {
      logger.error('❌ Ошибка при очистке тестового пользователя', {
        description: 'Error cleaning test user',
        error: deleteUserError.message,
        details: deleteUserError,
      })
      throw deleteUserError
    }

    // Создаем тестового пользователя
    const { error: userError } = await supabase.from('users').insert({
      telegram_id: String(TEST_OWNER_ID),
      bot_name: TEST_BOT_NAME,
      is_active: true,
      is_bot_owner: true,
    })

    if (userError) {
      logger.error('❌ Ошибка при создании тестового пользователя', {
        description: 'Error creating test user',
        error: userError.message,
        details: userError,
      })
      throw userError
    }

    // Тест 1: Проверка начального баланса
    const initialBalance = await getUserBalance(TEST_OWNER_ID, TEST_BOT_NAME)

    results.push({
      name: 'Initial Balance Check',
      success: initialBalance === 0,
      message:
        initialBalance === 0
          ? '✅ Начальный баланс корректно установлен в 0'
          : '❌ Ошибка в начальном балансе',
      details: { expected: 0, actual: initialBalance },
    })

    // Тест 2: Добавление средств
    const { error: paymentError } = await supabase.from('payments_v2').insert({
      telegram_id: String(TEST_OWNER_ID),
      amount: 100,
      stars: 100,
      bot_name: TEST_BOT_NAME,
      status: 'COMPLETED',
      type: 'money_income',
      payment_method: 'rub',
      description: 'Test payment',
    })

    if (paymentError) {
      logger.error('❌ Ошибка при создании тестового платежа', {
        description: 'Error creating test payment',
        error: paymentError.message,
        details: paymentError,
      })
      throw paymentError
    }

    // Проверяем обновленный баланс
    const updatedBalance = await getUserBalance(TEST_OWNER_ID, TEST_BOT_NAME)

    results.push({
      name: 'Balance Update After Payment',
      success: updatedBalance === 100,
      message:
        updatedBalance === 100
          ? '✅ Баланс корректно обновлен после платежа'
          : '❌ Ошибка в обновлении баланса',
      details: { expected: 100, actual: updatedBalance },
    })

    // Очистка тестовых данных
    const { error: cleanupPaymentsError } = await supabase
      .from('payments_v2')
      .delete()
      .eq('bot_name', TEST_BOT_NAME)
      .eq('telegram_id', String(TEST_OWNER_ID))

    if (cleanupPaymentsError) {
      logger.error('❌ Ошибка при очистке тестовых платежей', {
        description: 'Error cleaning up test payments',
        error: cleanupPaymentsError.message,
        details: cleanupPaymentsError,
      })
      throw cleanupPaymentsError
    }

    const { error: cleanupUserError } = await supabase
      .from('users')
      .delete()
      .eq('bot_name', TEST_BOT_NAME)
      .eq('telegram_id', String(TEST_OWNER_ID))

    if (cleanupUserError) {
      logger.error('❌ Ошибка при очистке тестового пользователя', {
        description: 'Error cleaning up test user',
        error: cleanupUserError.message,
        details: cleanupUserError,
      })
      throw cleanupUserError
    }

    logger.info('✅ Тестирование баланса завершено', {
      description: 'Balance testing completed',
      results,
    })
  } catch (error) {
    logger.error('❌ Ошибка при тестировании баланса', {
      description: 'Error during balance testing',
      error: error instanceof Error ? error.message : String(error),
      details: error,
    })

    results.push({
      name: 'Balance Testing',
      success: false,
      message: `❌ Ошибка при тестировании: ${
        error instanceof Error ? error.message : String(error)
      }`,
      details: error,
    })
  }

  return results
}
<<<<<<< Updated upstream
=======

export async function balanceTest(): Promise<TestResult> {
=======

export async function runBalanceTests(): Promise<TestResult> {
>>>>>>> b75d880 (tests)
  try {
    logger.info('🚀 Начинаем тест команды /balance', {
      description: 'Starting /balance command test',
    })

    const telegram_id = 123456789
    const bot_name = TEST_CONFIG.TEST_BOT_NAME

    // Cleanup any existing test data
    logger.info('🧹 Очистка существующих тестовых данных', {
      description: 'Cleaning up existing test data',
    })
    await Promise.all([
      supabase
        .from('users')
        .delete()
        .eq('telegram_id', telegram_id)
        .eq('bot_name', bot_name),
      supabase
        .from('payments_v2')
        .delete()
        .eq('telegram_id', telegram_id)
        .eq('bot_name', bot_name),
    ])

    // Wait a bit to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Create test user
    logger.info('👤 Создание тестового пользователя', {
      description: 'Creating test user',
    })
    const { error: createError } = await supabase.from('users').insert({
      telegram_id,
      bot_name,
    })

    if (createError) {
      throw new Error(`Failed to create test user: ${createError.message}`)
    }

    // Generate unique inv_id for test payment
    const inv_id = uuid()
    logger.info('🔍 Создаем тестовый платеж', {
      description: 'Creating test payment',
      inv_id,
    })

<<<<<<< HEAD
    // Проверяем баланс
    const balance = await getUserBalance(userTelegramId, botName)

    if (!balance) {
      throw new Error('Balance not found')
=======
    // Execute test payment
    await TEST_CONFIG.inngestEngine.execute({
      events: [
        {
          name: 'payment/process',
          data: {
            telegram_id,
            amount: 100,
            type: 'money_income',
            description: 'Test payment',
            bot_name,
            inv_id,
            stars: 100,
          },
        },
      ],
    })

    // Wait for payment to be processed
    await new Promise(resolve =>
      setTimeout(resolve, TEST_CONFIG.PAYMENT_PROCESSING_TIMEOUT)
    )

    // Check if payment was successful
    const { data: payment, error: paymentError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('bot_name', bot_name)
      .eq('inv_id', inv_id)
      .single()

    if (paymentError || !payment) {
      throw new Error(
        `Failed to find payment: ${
          paymentError?.message || 'Payment not found'
        }`
      )
>>>>>>> b75d880 (tests)
    }

    if (payment.status !== 'SUCCESS') {
      throw new Error(`Payment failed with status: ${payment.status}`)
    }

    // Cleanup test data if configured
    if (TEST_CONFIG.cleanupAfterEach) {
      logger.info('🧹 Очистка тестовых данных', {
        description: 'Cleaning up test data',
      })
      await Promise.all([
        supabase
          .from('users')
          .delete()
          .eq('telegram_id', telegram_id)
          .eq('bot_name', bot_name),
        supabase
          .from('payments_v2')
          .delete()
          .eq('telegram_id', telegram_id)
          .eq('bot_name', bot_name),
      ])
    }

    return {
      success: true,
      message: 'Тест команды /balance успешно пройден',
      name: 'Balance Command Test',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте команды /balance', {
      description: 'Error in /balance command test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      message: `Ошибка в тесте команды /balance: ${
        error instanceof Error ? error.message : String(error)
      }`,
      name: 'Balance Command Test',
    }
  }
}

async function cleanupTestData() {
  logger.info('🧹 Очистка тестовых данных', {
    description: 'Cleaning up test data',
    test_bot: TEST_CONFIG.TEST_BOT_NAME,
  })

  // Очищаем все тестовые данные
  await Promise.all([
    supabase
      .from('payments_v2')
      .delete()
      .eq('bot_name', TEST_CONFIG.TEST_BOT_NAME)
      .eq('telegram_id', String(TEST_CONFIG.TEST_OWNER_ID)),
    supabase
      .from('users')
      .delete()
      .eq('bot_name', TEST_CONFIG.TEST_BOT_NAME)
      .eq('telegram_id', String(TEST_CONFIG.TEST_OWNER_ID)),
  ])
}
>>>>>>> Stashed changes
