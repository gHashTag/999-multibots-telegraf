import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { Logger as logger } from '@/utils/logger'
import { v4 as uuid } from 'uuid'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'
import { TestResult } from '../types'
import { getPaymentByInvId } from '@/core/supabase/getPaymentByInvId'
import { TEST_CONFIG } from '../test-config'
import { InngestTestEngine } from '../inngest-test-engine'
import { PaymentProcessEvent } from '@/inngest-functions/paymentProcessor'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { TransactionType } from '@/interfaces/payments.interface'
import { inngest } from '@/inngest-functions/clients'
import { paymentProcessor } from '@/inngest-functions/paymentProcessor'
import { inngestTestEngine } from '../inngest'

// Создаем экземпляр тестового движка
const inngestTestEngine = new InngestTestEngine()

// Регистрируем обработчик платежей
inngestTestEngine.register('payment/process', paymentProcessor)

const waitForPaymentCompletion = async (inv_id: string, timeout = 30000) => {
  const startTime = Date.now()
  const checkInterval = 1000 // Увеличиваем интервал проверки до 1 секунды

  while (Date.now() - startTime < timeout) {
    const payment = await getPaymentByInvId(inv_id)
    if (payment) {
      logger.info('✅ Платеж найден', {
        description: 'Payment found',
        inv_id,
        payment,
      })
      return payment
    }

    logger.info('ℹ️ Платеж не найден', {
      description: 'Payment not found',
      inv_id,
      elapsed: Date.now() - startTime,
    })

    await new Promise(resolve => setTimeout(resolve, checkInterval))
  }

  throw new Error('Payment completion timeout')
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

export async function runPaymentTests(): Promise<TestResult> {
  const testTelegramId = normalizeTelegramId(Date.now())
  const testUsername = `test_user_${testTelegramId}`

  try {
    logger.info('🚀 Начало тестирования платежной системы', {
      description: 'Starting payment system test',
      telegram_id: testTelegramId,
      username: testUsername,
    })

    // Создаем тестового пользователя
    const { error: createError } = await supabase.from('users').insert({
      telegram_id: testTelegramId,
      username: testUsername,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
    })

    if (createError) {
      throw new Error(`Ошибка создания пользователя: ${createError.message}`)
    }

    // Проверяем начальный баланс
    const initialBalance = await getUserBalance(testTelegramId.toString())
    logger.info('💰 Начальный баланс:', {
      description: 'Initial balance check',
      balance: initialBalance,
    })

    // Тест 2: Пополнение баланса (STARS)
    const addInv_id = uuid()
    await inngestTestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 100,
        type: 'money_income',
        description: 'Test add payment via Inngest',
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        inv_id: addInv_id,
        service_type: ModeEnum.TopUpBalance,
      },
    })

    // Ждем завершения платежа
    await waitForPaymentCompletion(addInv_id)

    // Проверяем баланс после пополнения
    const balanceAfterAdd = await getUserBalance(testTelegramId.toString())
    logger.info('💰 Баланс после пополнения:', {
      description: 'Balance after add',
      balance: balanceAfterAdd,
    })

    if (balanceAfterAdd !== 100) {
      throw new Error(
        `Неверный баланс после пополнения. Ожидалось: 100, Получено: ${balanceAfterAdd}`
      )
    }

    // Тест 3: Списание средств
    const spendInv_id = uuid()
    await inngestTestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 30,
        type: 'money_expense',
        description: 'Test spend payment via Inngest',
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        inv_id: spendInv_id,
        service_type: ModeEnum.TextToImage,
      },
    })

    // Ждем завершения платежа
    await waitForPaymentCompletion(spendInv_id)

    // Проверяем финальный баланс
    const finalBalance = await getUserBalance(testTelegramId.toString())
    logger.info('💰 Финальный баланс:', {
      description: 'Final balance check',
      balance: finalBalance,
    })

    if (finalBalance !== 70) {
      throw new Error(
        `Неверный финальный баланс. Ожидалось: 70, Получено: ${finalBalance}`
      )
    }

    // Очистка тестовых данных
    if (TEST_CONFIG.cleanupAfterEach) {
      await Promise.all([
        supabase
          .from('users')
          .delete()
          .eq('telegram_id', testTelegramId)
          .eq('bot_name', TEST_CONFIG.TEST_BOT_NAME),
        supabase
          .from('payments_v2')
          .delete()
          .eq('telegram_id', testTelegramId)
          .eq('bot_name', TEST_CONFIG.TEST_BOT_NAME),
      ])
    }

    return {
      success: true,
      name: 'Payment System Test',
      message: 'Тест платежной системы успешно завершен',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте платежной системы:', {
      description: 'Error in payment system test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'Payment System Test',
      message: `Ошибка в тесте платежной системы: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error: error instanceof Error ? error : new Error(String(error))
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
    const paymentSystemResult = await runPaymentTests()
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
