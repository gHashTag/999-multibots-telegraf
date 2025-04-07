import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'
import { TestResult } from '../interfaces'
import { getPaymentByInvId } from '@/core/supabase/getPaymentByInvId'
import { TEST_CONFIG, inngestTestEngine } from '../test-config'

const waitForPaymentCompletion = async (inv_id: string, timeout = 5000) => {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    const payment = await getPaymentByInvId(inv_id)
    if (payment?.status === 'COMPLETED') {
      return payment
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Payment completion timeout')
}

/**
 * Очищает тестовые данные пользователя
 */
const cleanupTestUser = async (telegram_id: TelegramId) => {
  try {
    // Удаляем платежиОшибки TypeScript тоже проверить, что все нормально.
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

export async function testPaymentSystem(): Promise<TestResult> {
  const testTelegramId = Date.now().toString()
  const testBotName = TEST_CONFIG.TEST_BOT_NAME

  try {
    logger.info('🚀 Начинаем тест платежной системы', {
      description: 'Starting payment system test',
    })

    // Создаем тестового пользователя
    const { error: createError } = await supabase.from('users').insert({
      telegram_id: testTelegramId,
      username: `test_user_${testTelegramId}`,
      bot_name: testBotName,
    })

    if (createError) {
      throw new Error(`Ошибка создания пользователя: ${createError.message}`)
    }

    // Проверяем начальный баланс
    const initialBalance = await getUserBalance(testTelegramId)
    if (initialBalance !== 0) {
      throw new Error(`Начальный баланс ${initialBalance}, ожидалось 0`)
    }

    // Тестируем пополнение баланса
    const addInv_id = uuidv4()
    await inngestTestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 100,
        type: 'money_income',
        description: 'Test add stars',
        bot_name: testBotName,
        inv_id: addInv_id,
        service_type: ModeEnum.TopUpBalance,
      },
    })

    // Ждем завершения платежа
    await waitForPaymentCompletion(addInv_id)

    // Проверяем баланс после пополнения
    const balanceAfterAdd = await getUserBalance(testTelegramId)
    if (balanceAfterAdd !== 100) {
      throw new Error(
        `Баланс после пополнения ${balanceAfterAdd}, ожидалось 100`
      )
    }

    // Тестируем списание баланса
    const spendInv_id = uuidv4()
    await inngestTestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 30,
        type: 'money_expense',
        description: 'Test spend stars',
        bot_name: testBotName,
        inv_id: spendInv_id,
        service_type: ModeEnum.TextToVideo,
      },
    })

    // Ждем завершения платежа
    await waitForPaymentCompletion(spendInv_id)

    // Проверяем баланс после списания
    const balanceAfterSpend = await getUserBalance(testTelegramId)
    if (balanceAfterSpend !== 70) {
      throw new Error(
        `Баланс после списания ${balanceAfterSpend}, ожидалось 70`
      )
    }

    // Очистка тестовых данных
    if (TEST_CONFIG.cleanupAfterEach) {
      await Promise.all([
        supabase
          .from('users')
          .delete()
          .eq('telegram_id', testTelegramId)
          .eq('bot_name', testBotName),
        supabase
          .from('payments_v2')
          .delete()
          .eq('telegram_id', testTelegramId)
          .eq('bot_name', testBotName),
      ])
    }

    logger.info('✅ Тесты платежной системы завершены успешно', {
      description: 'Payment system tests completed successfully',
    })

    return {
      name: 'Payment System Test',
      success: true,
      message: 'Тесты платежной системы успешно пройдены',
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при тестировании платежной системы',
      description: 'Error in payment system test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      name: 'Payment System Test',
      success: false,
      message: `Ошибка при тестировании: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}

/**
 * Запускает все тесты, связанные с платежной системой
 */
export const runAllPaymentTests = async (): Promise<TestResult[]> => {
  logger.info('🚀 Запуск всех тестов платежной системы', {
    description: 'Running all payment system tests',
  })

  const results: TestResult[] = []

  try {
    // Основной тест платежной системы
    const paymentSystemResult = await testPaymentSystem()
    results.push(paymentSystemResult)

    logger.info('✅ Все тесты платежной системы завершены', {
      description: 'All payment system tests completed',
      success_count: results.filter(r => r.success).length,
      fail_count: results.filter(r => !r.success).length,
    })

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов платежной системы:', {
      description: 'Error running payment system tests',
      error: error instanceof Error ? error.message : String(error),
    })
    return [
      {
        success: false,
        name: 'Payment System Tests',
        message: `Ошибка при запуске тестов платежной системы: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    ]
  }
}
