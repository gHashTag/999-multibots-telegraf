import { inngest } from '@/inngest-functions/clients'
import { logger } from '@/utils/logger'
import { SUBSCRIPTION_PLANS } from '@/inngest-functions/ruPayment.service'

import { supabase } from '@/core/supabase'

const testTelegramId = `${Math.floor(Math.random() * 1000000000000)}`

const runTest = async () => {
  try {
    logger.info('🚀 Начало тестирования webhook', {
      description: 'Starting webhook testing',
    })

    // Создаем тестового пользователя
    logger.info('👤 Создание тестового пользователя', {
      description: 'Creating test user',
      telegram_id: testTelegramId,
    })

    const { data: userData, error: userError } = await supabase
      .from('users')
      .upsert({
        telegram_id: testTelegramId,
        language_code: 'ru',
        first_name: 'Test',
        last_name: 'User',
        username: `test_user_${Math.floor(Math.random() * 1000000)}`,
        balance: 0,
        bot_name: 'test_bot',
      })
      .select()

    if (userError) {
      logger.error('❌ Ошибка при создании пользователя:', {
        description: 'Error creating test user',
        error: userError.message,
        details: userError,
      })
      throw new Error(`Error creating test user: ${userError.message}`)
    }

    logger.info('✅ Тестовый пользователь создан', {
      description: 'Test user created',
      telegram_id: testTelegramId,
      user_data: userData,
    })

    // 1. Тест обычного пополнения баланса
    const testBalancePayment = async () => {
      const inv_id = `test-invoice-${Date.now()}`
      const amount = 500

      logger.info('🚀 Создание тестового платежа', {
        description: 'Creating test payment',
        inv_id: inv_id,
        amount,
        telegram_id: testTelegramId,
      })

      try {
        // Создаем запись о платеже
        const { data: paymentData, error: paymentError } = await supabase
          .from('payments_v2')
          .insert({
            telegram_id: testTelegramId,
            amount: amount,
            currency: 'RUB',
            stars: 0,
            status: 'PENDING',
            payment_method: 'ROBOKASSA',
            bot_name: 'test_bot',
            description: 'Test balance payment',
            inv_id: inv_id,
            metadata: {},
            language: 'ru',
            invoice_url: '',
          })
          .select()

        if (paymentError) {
          logger.error('❌ Ошибка при создании платежа:', {
            description: 'Error creating test payment',
            error: paymentError.message,
            details: paymentError,
          })
          throw paymentError
        }

        logger.info('✅ Тестовый платеж создан', {
          description: 'Test payment created',
          inv_id: inv_id,
          amount,
          telegram_id: testTelegramId,
          payment_data: paymentData,
        })

        // Отправляем событие в Inngest
        await inngest.send({
          name: 'robokassa/webhook.ru',
          data: {
            inv_id: inv_id,
            out_sum: amount,
            crc: 'test-crc',
            SignatureValue: 'test-signature',
          },
        })

        logger.info('✅ Событие отправлено в Inngest', {
          description: 'Event sent to Inngest',
          inv_id: inv_id,
          amount,
        })
      } catch (error) {
        logger.error('❌ Ошибка в тесте пополнения баланса:', {
          description: 'Error in balance payment test',
          error: error instanceof Error ? error.message : String(error),
          inv_id: inv_id,
        })
        throw error
      }
    }

    // 2. Тест оплаты подписки
    const testSubscriptionPayment = async () => {
      const inv_id = `test-invoice-${Date.now()}`
      const subscriptionPlan = SUBSCRIPTION_PLANS[0]
      const amount = subscriptionPlan.ru_price
      const stars = subscriptionPlan.stars_price

      logger.info('🚀 Создание тестового платежа подписки', {
        description: 'Creating test subscription payment',
        inv_id: inv_id,
        amount,
        telegram_id: testTelegramId,
        plan: subscriptionPlan.callback_data,
      })

      try {
        // Создаем запись о платеже
        const { data: paymentData, error: paymentError } = await supabase
          .from('payments_v2')
          .insert({
            telegram_id: testTelegramId,
            amount: amount,
            currency: 'RUB',
            stars: stars,
            status: 'PENDING',
            payment_method: 'ROBOKASSA',
            bot_name: 'test_bot',
            description: `Test subscription payment - ${subscriptionPlan.text}`,
            inv_id: inv_id,
            metadata: {
              subscription_plan: subscriptionPlan.callback_data,
            },
            language: 'ru',
            invoice_url: '',
          })
          .select()

        if (paymentError) {
          logger.error('❌ Ошибка при создании платежа подписки:', {
            description: 'Error creating test subscription payment',
            error: paymentError.message,
            details: paymentError,
          })
          throw paymentError
        }

        logger.info('✅ Тестовый платеж подписки создан', {
          description: 'Test subscription payment created',
          inv_id: inv_id,
          amount,
          telegram_id: testTelegramId,
          plan: subscriptionPlan.callback_data,
          payment_data: paymentData,
        })

        // Отправляем событие в Inngest
        await inngest.send({
          name: 'robokassa/webhook.ru',
          data: {
            inv_id: inv_id,
            out_sum: amount,
            crc: 'test-crc',
            SignatureValue: 'test-signature',
          },
        })

        logger.info('✅ Событие подписки отправлено в Inngest', {
          description: 'Subscription event sent to Inngest',
          inv_id: inv_id,
          amount,
          plan: subscriptionPlan.callback_data,
        })
      } catch (error) {
        logger.error('❌ Ошибка в тесте подписки:', {
          description: 'Error in subscription payment test',
          error: error instanceof Error ? error.message : String(error),
          inv_id: inv_id,
        })
        throw error
      }
    }

    // Запускаем тесты последовательно
    await testBalancePayment()
    logger.info('✅ Тест пополнения баланса завершен', {
      description: 'Balance payment test completed',
    })

    // Ждем 2 секунды между тестами
    await new Promise(resolve => setTimeout(resolve, 2000))

    await testSubscriptionPayment()
    logger.info('✅ Тест подписки завершен', {
      description: 'Subscription test completed',
    })

    logger.info('✅ Тестирование webhook завершено', {
      description: 'Webhook testing completed',
    })
  } catch (error) {
    logger.error('❌ Ошибка при выполнении тестов:', {
      description: 'Error running tests',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

// Запускаем тесты
runTest().catch(error => {
  logger.error('❌ Критическая ошибка:', {
    description: 'Critical error',
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})

export default runTest
