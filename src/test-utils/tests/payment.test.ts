import { getUserBalance } from '@/core/supabase/getUserBalance'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'
import { TestResult } from '../interfaces'
import { getPaymentByInvId } from '@/core/supabase/getPaymentByInvId'
import { TEST_CONFIG } from '../test-config'
import { InngestTestEngine } from '../inngest-test-engine'
import { PaymentProcessEvent } from '@/inngest-functions/paymentProcessor'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { TransactionType } from '@/interfaces/payments.interface'

// Создаем экземпляр тестового движка
const inngestTestEngine = new InngestTestEngine()

const paymentProcessor = async ({
  event,
}: {
  event: { data: PaymentProcessEvent['data'] }
}) => {
  const { telegram_id, amount, type, description, bot_name, service_type } =
    event.data as {
      telegram_id: string
      amount: number
      type: TransactionType
      description: string
      bot_name: string
      service_type: string
    }

  logger.info('🚀 Начало обработки платежа', {
    description: 'Starting payment processing',
    telegram_id,
    amount,
    type,
    bot_name,
    service_type,
  })

  try {
    // Создаем запись о платеже
    const payment = await createSuccessfulPayment({
      telegram_id,
      amount,
      stars: amount,
      type,
      description,
      bot_name,
      service_type,
      payment_method: 'balance',
      status: 'COMPLETED',
      inv_id: event.data.inv_id,
    })

    logger.info('✅ Платеж создан', {
      description: 'Payment created',
      payment_id: payment.payment_id,
      telegram_id,
      amount,
      type,
    })

    return { success: true, payment }
  } catch (error) {
    logger.error('❌ Ошибка при обработке платежа', {
      description: 'Error processing payment',
      telegram_id,
      amount,
      type,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}

inngestTestEngine.registerEventHandler('payment/process', paymentProcessor)

const waitForPaymentCompletion = async (inv_id: string, timeout = 10000) => {
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

export async function testPaymentSystem(): Promise<TestResult> {
  const testTelegramId = Date.now().toString()
  const testBotName = TEST_CONFIG.TEST_BOT_NAME

  try {
    logger.info('🚀 Начинаем тест платежной системы', {
      description: 'Starting payment system test',
      test_telegram_id: testTelegramId,
      test_bot_name: testBotName,
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

    logger.info('👤 Создан тестовый пользователь', {
      description: 'Test user created',
      telegram_id: testTelegramId,
      bot_name: testBotName,
    })

    // Проверяем начальный баланс
    const initialBalance = await getUserBalance(testTelegramId)
    if (initialBalance !== 0) {
      throw new Error(`Начальный баланс ${initialBalance}, ожидалось 0`)
    }

    logger.info('💰 Начальный баланс проверен', {
      description: 'Initial balance checked',
      balance: initialBalance,
    })

    // Тестируем пополнение баланса
    const addInv_id = `${testTelegramId}-${Date.now()}`
    await TEST_CONFIG.inngestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 100,
        type: 'money_income',
        description: 'Test add stars',
        bot_name: testBotName,
        inv_id: addInv_id,
        service_type: ModeEnum.TopUpBalance,
        test_mode: true,
      },
    })

    logger.info('💸 Отправлен запрос на пополнение баланса', {
      description: 'Balance top-up request sent',
      amount: 100,
      inv_id: addInv_id,
    })

    // Ждем завершения платежа
    const addPayment = await waitForPaymentCompletion(addInv_id)

    logger.info('✅ Платеж на пополнение завершен', {
      description: 'Top-up payment completed',
      payment: addPayment,
    })

    // Проверяем баланс после пополнения
    const balanceAfterAdd = await getUserBalance(testTelegramId)
    if (balanceAfterAdd !== 100) {
      throw new Error(
        `Баланс после пополнения ${balanceAfterAdd}, ожидалось 100`
      )
    }

    logger.info('💰 Баланс после пополнения проверен', {
      description: 'Balance after top-up checked',
      balance: balanceAfterAdd,
    })

    // Тестируем списание баланса
    const spendInv_id = `${testTelegramId}-${Date.now()}`
    await TEST_CONFIG.inngestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 30,
        type: 'money_expense',
        description: 'Test spend stars',
        bot_name: testBotName,
        inv_id: spendInv_id,
        service_type: ModeEnum.TextToVideo,
        test_mode: true,
      },
    })

    logger.info('💸 Отправлен запрос на списание баланса', {
      description: 'Balance withdrawal request sent',
      amount: 30,
      inv_id: spendInv_id,
    })

    // Ждем завершения платежа
    const spendPayment = await waitForPaymentCompletion(spendInv_id)

    logger.info('✅ Платеж на списание завершен', {
      description: 'Withdrawal payment completed',
      payment: spendPayment,
    })

    // Проверяем баланс после списания
    const balanceAfterSpend = await getUserBalance(testTelegramId)
    if (balanceAfterSpend !== 70) {
      throw new Error(
        `Баланс после списания ${balanceAfterSpend}, ожидалось 70`
      )
    }

    logger.info('💰 Баланс после списания проверен', {
      description: 'Balance after withdrawal checked',
      balance: balanceAfterSpend,
    })

    // Тестируем защиту от овердрафта
    const overdraftInv_id = `${testTelegramId}-${Date.now()}`
    await TEST_CONFIG.inngestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 100,
        type: 'money_expense',
        description: 'Test overdraft protection',
        bot_name: testBotName,
        inv_id: overdraftInv_id,
        service_type: ModeEnum.TextToVideo,
        test_mode: true,
      },
    })

    logger.info('🛡️ Отправлен запрос на проверку защиты от овердрафта', {
      description: 'Overdraft protection test request sent',
      amount: 100,
      inv_id: overdraftInv_id,
    })

    // Ждем завершения платежа
    try {
      await waitForPaymentCompletion(overdraftInv_id)
      throw new Error('Платеж с овердрафтом должен был быть отклонен')
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Payment completion timeout'
      ) {
        logger.info('✅ Защита от овердрафта сработала', {
          description: 'Overdraft protection worked',
          inv_id: overdraftInv_id,
        })
      } else {
        throw error
      }
    }

    // Проверяем баланс после попытки овердрафта
    const balanceAfterOverdraft = await getUserBalance(testTelegramId)
    if (balanceAfterOverdraft !== 70) {
      throw new Error(
        `Баланс после попытки овердрафта ${balanceAfterOverdraft}, ожидалось 70`
      )
    }

    logger.info('💰 Баланс после попытки овердрафта проверен', {
      description: 'Balance after overdraft attempt checked',
      balance: balanceAfterOverdraft,
    })

    // Очищаем тестовые данные
    const { error: deleteUserError } = await supabase
      .from('users')
      .delete()
      .eq('telegram_id', testTelegramId)

    if (deleteUserError) {
      logger.error('❌ Ошибка при удалении тестового пользователя', {
        description: 'Error deleting test user',
        error: deleteUserError.message,
      })
    }

    const { error: deletePaymentsError } = await supabase
      .from('payments_v2')
      .delete()
      .eq('telegram_id', testTelegramId)

    if (deletePaymentsError) {
      logger.error('❌ Ошибка при удалении тестовых платежей', {
        description: 'Error deleting test payments',
        error: deletePaymentsError.message,
      })
    }

    logger.info('🧹 Тестовые данные очищены', {
      description: 'Test data cleaned up',
      telegram_id: testTelegramId,
    })

    return {
      name: 'Payment System Test',
      success: true,
      message: 'Тест платежной системы успешно завершен',
      startTime: Date.now(),
    }
  } catch (error) {
    logger.error('❌ Ошибка при тестировании платежной системы', {
      description: 'Error in payment system test',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id: testTelegramId,
      bot_name: testBotName,
    })

    return {
      name: 'Payment System Test',
      success: false,
      message: `Ошибка при тестировании: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
      error: error instanceof Error ? error : new Error(String(error)),
      startTime: Date.now(),
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
        startTime: Date.now(),
      },
    ]
  }
}
