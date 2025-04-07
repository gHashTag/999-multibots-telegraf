import { v4 as uuid } from 'uuid'
import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { TestResult } from '../interfaces'
import { TEST_CONFIG } from '../test-config'
import { supabase } from '@/core/supabase'

export async function runStatsTests(): Promise<TestResult> {
  try {
    logger.info('🚀 Начинаем тест команды /stats', {
      description: 'Starting /stats command test',
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
    await TEST_CONFIG.inngestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: TEST_CONFIG.TEST_TELEGRAM_ID,
        amount: 100,
        type: 'money_income',
        description: 'Test payment',
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        inv_id,
        stars: 100,
      },
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
      message: 'Тест команды /stats успешно пройден',
      name: 'Stats Command Test',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте команды /stats', {
      description: 'Error in /stats command test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      message: `Ошибка в тесте команды /stats: ${
        error instanceof Error ? error.message : String(error)
      }`,
      name: 'Stats Command Test',
    }
  }
}
