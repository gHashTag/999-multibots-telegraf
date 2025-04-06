import { v4 as uuid } from 'uuid'
import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { TestResult } from '../types'
import { TEST_CONFIG } from '../test-config'
import { supabase } from '@/core/supabase'

export async function runBalanceTests(): Promise<TestResult> {
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
