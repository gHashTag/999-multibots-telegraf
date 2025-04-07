import { supabase } from '@/core/supabase'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { logger } from '@/utils/logger'
import { TEST_CONFIG } from './test-config'
import { v4 as uuidv4 } from 'uuid'

export const testPaymentSystem = async () => {
  try {
    const testTelegramId = Date.now().toString()
    const testBotName = 'test_bot'

    logger.info('🚀 Начало тестирования платежной системы', {
      description: 'Starting payment system test',
      telegram_id: testTelegramId,
    })

    // Шаг 1: Проверяем начальный баланс
    const initialBalance = await getUserBalance(testTelegramId, testBotName)
    logger.info('💰 Начальный баланс', {
      description: 'Initial balance check',
      telegram_id: testTelegramId,
      balance: initialBalance,
    })

    // Шаг 2: Добавляем звезды через Inngest
    const addInv_id = uuidv4()
    await TEST_CONFIG.inngestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: 100,
        type: 'money_income',
        description: 'Test add stars',
        bot_name: testBotName,
        inv_id: addInv_id,
      },
    })

    // Шаг 3: Проверяем баланс после добавления
    const balanceAfterAdd = await getUserBalance(testTelegramId, testBotName)
    logger.info('💰 Баланс после добавления', {
      description: 'Balance after adding stars',
      telegram_id: testTelegramId,
      balance: balanceAfterAdd,
      expected: 100,
    })

    // Шаг 4: Списываем звезды через Inngest
    const spendInv_id = uuidv4()
    await TEST_CONFIG.inngestEngine.send({
      name: 'payment/process',
      data: {
        telegram_id: testTelegramId,
        amount: -30,
        type: 'money_expense',
        description: 'Test spend stars',
        bot_name: testBotName,
        inv_id: spendInv_id,
      },
    })

    // Шаг 5: Проверяем финальный баланс
    const finalBalance = await getUserBalance(testTelegramId, testBotName)
    logger.info('💰 Финальный баланс', {
      description: 'Final balance check',
      telegram_id: testTelegramId,
      balance: finalBalance,
      expected: 70,
    })

    // Шаг 6: Проверяем записи в таблице payments_v2
    const { data: payments, error } = await supabase
      .from('payments_v2')
      .select('amount, stars, payment_method, status, description')
      .eq('telegram_id', testTelegramId)
      .order('payment_date', { ascending: false })

    if (error) {
      throw error
    }

    logger.info('📊 Записи в таблице payments_v2', {
      description: 'Payments records',
      telegram_id: testTelegramId,
      payments,
    })

    // Проверяем результаты
    const testsPassed =
      initialBalance === 0 &&
      balanceAfterAdd === 100 &&
      finalBalance === 70 &&
      payments.length === 2

    if (testsPassed) {
      logger.info('✅ Тесты успешно пройдены', {
        description: 'All tests passed successfully',
        telegram_id: testTelegramId,
      })
    } else {
      logger.error('❌ Тесты не пройдены', {
        description: 'Tests failed',
        telegram_id: testTelegramId,
        initialBalance,
        balanceAfterAdd,
        finalBalance,
        paymentsCount: payments.length,
      })
    }

    // Очистка тестовых данных
    if (TEST_CONFIG.cleanupAfterEach) {
      await supabase
        .from('payments_v2')
        .delete()
        .eq('telegram_id', testTelegramId)
    }

    return testsPassed
  } catch (error) {
    logger.error('❌ Ошибка при тестировании', {
      description: 'Error during testing',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return false
  }
}
