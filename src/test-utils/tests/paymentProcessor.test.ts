import { TEST_CONFIG } from '../test-config'
import { TestResult } from '../types'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/types/modes'
import { supabase } from '@/core/supabase'
import { InngestTestEngine } from '../inngest/inngest-test-engine'
import { paymentProcessor } from '@/inngest-functions/paymentProcessor'
import * as notificationModule from '@/helpers/sendTransactionNotification'

/**
 * Тест для проверки функциональности обработчика платежей
 */
export async function testPaymentProcessor(): Promise<TestResult> {
  const testName = 'Payment Processor Test'
  // Сохраняем оригинальную функцию
  const originalSendNotification =
    notificationModule.sendTransactionNotification

  try {
    // Подменяем функцию отправки уведомлений моком
    // @ts-ignore - игнорируем ошибку, что свойство readonly
    notificationModule.sendTransactionNotification = async (params: any) => {
      logger.info('🔄 МОК: Отправка транзакционного уведомления', {
        description: 'MOCK: Sending transaction notification',
        ...params,
      })
      return { messageId: 123 }
    }

    logger.info('🚀 Запуск теста платежного процессора', {
      description: 'Starting payment processor test',
    })

    // Создаем уникальный идентификатор для тестового пользователя
    const telegram_id = `${Math.floor(Math.random() * 1000000000)}`
    const username = `test_user_${Math.floor(Math.random() * 100000)}`
    const bot_name = 'neuro_blogger_bot'

    // Создаем тестового пользователя в базе данных
    logger.info('👤 Создание тестового пользователя', {
      description: 'Creating test user',
      telegram_id,
      username,
      bot_name,
    })

    const { error } = await supabase
      .from('users')
      .upsert({
        telegram_id,
        username,
        first_name: 'Test',
        last_name: 'User',
        language_code: 'ru',
        bot_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Error creating test user: ${error.message}`)
    }

    // Инициализируем тестовый движок
    const testEngine = new InngestTestEngine({
      maxWaitTime: TEST_CONFIG.eventProcessingTimeout,
      eventBufferSize: TEST_CONFIG.eventBufferSize,
    })

    // Регистрируем функцию paymentProcessor
    testEngine.register('payment/process', paymentProcessor)

    // Тестируем пополнение баланса
    logger.info('💰 Тестирование пополнения баланса', {
      description: 'Testing balance top-up',
      telegram_id,
    })

    const topUpResult = await testEngine.send({
      name: 'payment/process',
      data: {
        telegram_id,
        amount: 100,
        stars: 100,
        type: 'money_income',
        description: 'Test balance top-up',
        bot_name,
        service_type: ModeEnum.TopUpBalance,
      },
    })

    if (!topUpResult.success) {
      throw new Error(
        `Failed to process top-up payment: ${
          topUpResult.error instanceof Error
            ? topUpResult.error.message
            : 'Unknown error'
        }`
      )
    }

    // Проверяем баланс пользователя
    const { data: balance, error: balanceError } = await supabase.rpc(
      'get_user_balance',
      {
        user_telegram_id: telegram_id,
      }
    )

    if (balanceError) {
      throw new Error(`Error checking user balance: ${balanceError.message}`)
    }

    logger.info('💰 Баланс после пополнения', {
      description: 'Balance after top-up',
      balance,
      expected_balance: 100,
    })

    if (balance !== 100) {
      throw new Error(
        `Balance incorrect after top-up: expected 100, got ${balance}`
      )
    }

    // Тестируем списание со счета
    logger.info('💸 Тестирование списания со счета', {
      description: 'Testing balance withdrawal',
      telegram_id,
    })

    const withdrawalResult = await testEngine.send({
      name: 'payment/process',
      data: {
        telegram_id,
        amount: 30,
        stars: 30,
        type: 'money_expense',
        description: 'Test balance withdrawal',
        bot_name,
        service_type: ModeEnum.TextToImage,
      },
    })

    if (!withdrawalResult.success) {
      throw new Error(
        `Failed to process withdrawal payment: ${
          withdrawalResult.error instanceof Error
            ? withdrawalResult.error.message
            : 'Unknown error'
        }`
      )
    }

    // Проверяем обновленный баланс
    const { data: updatedBalance, error: updatedBalanceError } =
      await supabase.rpc('get_user_balance', {
        user_telegram_id: telegram_id,
      })

    if (updatedBalanceError) {
      throw new Error(
        `Error checking updated user balance: ${updatedBalanceError.message}`
      )
    }

    logger.info('💰 Баланс после списания', {
      description: 'Balance after withdrawal',
      balance: updatedBalance,
      expected_balance: 70,
    })

    if (updatedBalance !== 70) {
      throw new Error(
        `Balance incorrect after withdrawal: expected 70, got ${updatedBalance}`
      )
    }

    // Очистка тестовых данных
    logger.info('🧹 Очистка тестовых данных', {
      description: 'Cleaning up test data',
      telegram_id,
    })

    const { error: deleteUserError } = await supabase
      .from('users')
      .delete()
      .eq('telegram_id', telegram_id)

    if (deleteUserError) {
      logger.warn('⚠️ Не удалось удалить тестового пользователя', {
        description: 'Failed to delete test user',
        error: deleteUserError.message,
      })
    }

    const { error: deletePaymentsError } = await supabase
      .from('payments_v2')
      .delete()
      .eq('telegram_id', telegram_id)

    if (deletePaymentsError) {
      logger.warn('⚠️ Не удалось удалить тестовые платежи', {
        description: 'Failed to delete test payments',
        error: deletePaymentsError.message,
      })
    }

    return {
      name: testName,
      success: true,
      message: 'Payment processor test completed successfully',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте платежного процессора', {
      description: 'Error in payment processor test',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      name: testName,
      success: false,
      message: `Test failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  } finally {
    // Восстанавливаем оригинальную функцию
    // @ts-ignore - игнорируем ошибку, что свойство readonly
    notificationModule.sendTransactionNotification = originalSendNotification
  }
}

// Если файл запущен напрямую, выполняем тест
if (require.main === module) {
  ;(async () => {
    try {
      console.log('🚀 Запуск теста платежного процессора напрямую')
      console.log('----------------------------------------')

      const result = await testPaymentProcessor()

      if (result.success) {
        console.log('✅ Тест успешно пройден:', result.name)
        console.log('✅ Сообщение:', result.message)
        console.log('----------------------------------------')
        process.exit(0)
      } else {
        console.error('❌ Тест не пройден:', result.name)
        console.error('❌ Сообщение:', result.message)
        console.error('❌ Ошибка:', result.error?.message)
        console.log('----------------------------------------')
        process.exit(1)
      }
    } catch (error) {
      console.error('❌ Неожиданная ошибка при выполнении теста')
      console.error(
        '❌ Ошибка:',
        error instanceof Error ? error.message : String(error)
      )
      console.error(
        '❌ Стек:',
        error instanceof Error ? error.stack : 'Стек недоступен'
      )
      console.log('----------------------------------------')
      process.exit(1)
    }
  })()
}
