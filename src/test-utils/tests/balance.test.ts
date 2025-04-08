import { v4 as uuid } from 'uuid'
import { Logger as logger } from '@/utils/logger'
import { TestResult } from '../types'
import { TEST_CONFIG } from '../test-config'
import { supabase } from '@/core/supabase'
import { getUserBalance } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'
import {
  TelegramId,
  normalizeTelegramId,
} from '@/interfaces/telegram.interface'
import { getPaymentByInvId } from '@/core/supabase/getPaymentByInvId'
import { InngestTestEngine } from '../inngest-test-engine'
import { PaymentProcessEvent } from '@/inngest-functions/paymentProcessor'
import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { TransactionType } from '@/interfaces/payments.interface'

// Создаем экземпляр тестового движка
const inngestTestEngine = new InngestTestEngine()

// Регистрируем обработчик платежей
inngestTestEngine.register('payment/process', async ({ 
  event,
  step 
}: {
  event: { data: PaymentProcessEvent['data'] },
  step: unknown
}) => {
  const { telegram_id, amount, type, description, bot_name, service_type } = event.data as {
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
})

const waitForPaymentCompletion = async (inv_id: string, timeout = 30000) => {
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

export async function runBalanceTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const testTelegramId = normalizeTelegramId(Date.now())

  try {
    logger.info('🚀 Начинаем тест команды /balance', {
      description: 'Starting /balance command test',
    })

    // Создаем тестового пользователя
    const { error: createError } = await supabase.from('users').insert({
      telegram_id: testTelegramId,
      username: `test_user_${testTelegramId}`,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
    })

    if (createError) {
      throw new Error(`Ошибка создания пользователя: ${createError.message}`)
    }

    // Проверяем начальный баланс
    const initialBalance = await getUserBalance(testTelegramId.toString())
    results.push({
      success: initialBalance === 0,
      name: 'Initial Balance Check',
      message:
        initialBalance === 0
          ? '✅ Начальный баланс корректно установлен в 0'
          : `❌ Ошибка: начальный баланс ${initialBalance}, ожидалось 0`,
    })

    // Тестируем пополнение баланса
    const addInv_id = uuid()
    await inngestTestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 100,
        type: 'money_income',
        description: 'Test balance add',
        bot_name: TEST_CONFIG.TEST_BOT_NAME,
        inv_id: addInv_id,
        service_type: ModeEnum.TopUpBalance,
      },
    })

    // Ждем завершения платежа
    await waitForPaymentCompletion(addInv_id)

    // Проверяем баланс после пополнения
    const balanceAfterAdd = await getUserBalance(testTelegramId.toString())
    results.push({
      success: balanceAfterAdd === 100,
      name: 'Balance After Add',
      message:
        balanceAfterAdd === 100
          ? '✅ Баланс успешно пополнен'
          : `❌ Ошибка: баланс после пополнения ${balanceAfterAdd}, ожидалось 100`,
    })

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

    logger.info('✅ Тесты баланса завершены', {
      description: 'Balance tests completed',
      results,
    })
  } catch (error) {
    results.push({
      success: false,
      name: 'Balance Test Error',
      message: `❌ Ошибка при тестировании баланса: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error: error instanceof Error ? error : new Error(String(error))
    })
  }

  return results
}
