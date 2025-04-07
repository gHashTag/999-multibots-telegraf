import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'
import { inngest } from '@/inngest-functions/clients'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'
import { TestResult } from '../types'
import { getPaymentByInvId } from '@/core/supabase/getPaymentByInvId'
import { TEST_CONFIG } from '../test-config'

const waitForPaymentCompletion = async (
  telegram_id: TelegramId,
  operation_id: string,
  expectedBalance: number,
  bot_name: string
): Promise<boolean> => {
  let attempts = 0
  const maxAttempts = 5 // Уменьшаем количество попыток
  const delay = 1000 // 1 second

  while (attempts < maxAttempts) {
    try {
      // Проверяем запись в payments_v2
      const payment = await getPaymentByInvId(operation_id)

      // Проверяем текущий баланс
      const currentBalance = await getUserBalance(
        telegram_id.toString(),
        bot_name
      )

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
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
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
    const initialBalance = await getUserBalance(
      testTelegramId.toString(),
      TEST_CONFIG.TEST_BOT_NAME
    )
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
    const addInv_id = uuidv4()
    await TEST_CONFIG.inngestEngine.execute({
      events: [
        {
          name: 'payment/process',
          data: {
            telegram_id: testTelegramId,
            amount: 100,
            type: 'money_income',
            description: 'Test add payment via Inngest',
            bot_name: TEST_CONFIG.TEST_BOT_NAME,
            inv_id: addInv_id,
            metadata: {
              service_type: 'System',
              test: true,
            },
          },
        },
      ],
    })

    // Даем время на обработку события
    await new Promise(resolve => setTimeout(resolve, 1000))

    const balanceAfterAdd = await getUserBalance(
      testTelegramId.toString(),
      TEST_CONFIG.TEST_BOT_NAME
    )
    if (balanceAfterAdd !== 100) {
      throw new Error(
        `Баланс после пополнения должен быть 100, получено: ${balanceAfterAdd}`
      )
    }

    // Тест 3: Списание средств
    const spendInv_id = uuidv4()
    await TEST_CONFIG.inngestEngine.execute({
      events: [
        {
          name: 'payment/process',
          data: {
            telegram_id: testTelegramId,
            amount: -30,
            type: 'money_expense',
            description: 'Test spend payment via Inngest',
            bot_name: TEST_CONFIG.TEST_BOT_NAME,
            inv_id: spendInv_id,
            metadata: {
              service_type: ModeEnum.TextToImage,
              test: true,
            },
          },
        },
      ],
    })

    // Даем время на обработку события
    await new Promise(resolve => setTimeout(resolve, 1000))

    const finalBalance = await getUserBalance(
      testTelegramId.toString(),
      TEST_CONFIG.TEST_BOT_NAME
    )
    if (finalBalance !== 70) {
      throw new Error(
        `Финальный баланс должен быть 70, получено: ${finalBalance}`
      )
    }

    logger.info('✅ Тест платежной системы успешно завершен', {
      description: 'Payment system test completed successfully',
      telegram_id: testTelegramId,
      final_balance: finalBalance,
    })

<<<<<<< Updated upstream
    // Получаем все платежи пользователя для отчета
    const { data: payments } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', testTelegramId)

=======
>>>>>>> Stashed changes
    // Очистка тестовых данных
    if (TEST_CONFIG.cleanupAfterEach) {
      await Promise.all([
        supabase.from('payments_v2').delete().eq('telegram_id', testTelegramId),
        supabase.from('users').delete().eq('telegram_id', testTelegramId),
      ])
    }

    return {
      success: true,
<<<<<<< HEAD
      name: 'Payment System Test',
      message: 'Все тесты платежной системы успешно пройдены',
      details: {
        telegram_id: testTelegramId,
        final_balance: finalBalance,
        payments_count: payments ? payments.length : 0,
      },
=======
      message: 'Тест платежной системы успешно завершен',
      name: 'Payment System Test',
>>>>>>> b75d880 (tests)
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте платежной системы:', {
      description: 'Error in payment system test',
      error: error instanceof Error ? error.message : String(error),
      telegram_id: testTelegramId,
    })

    return {
      success: false,
<<<<<<< HEAD
      name: 'Payment System Test',
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
=======
      message: `Ошибка в тесте платежной системы: ${
        error instanceof Error ? error.message : String(error)
      }`,
      name: 'Payment System Test',
>>>>>>> b75d880 (tests)
    }
  }
}
