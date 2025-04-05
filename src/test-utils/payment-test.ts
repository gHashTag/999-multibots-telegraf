import { TelegramId } from '@/interfaces/telegram.interface'
import { supabase } from '@/core/supabase'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { logger } from '@/utils/logger'

export const testPaymentSystem = async () => {
  try {
    const testTelegramId = Date.now()
    logger.info('🚀 Начало тестирования платежной системы', {
      description: 'Starting payment system test',
      telegram_id: testTelegramId,
    })

    // Шаг 1: Проверяем начальный баланс
    const initialBalance = await getUserBalance(
      testTelegramId.toString(),
      'ai_koshey_bot'
    )
    logger.info('💰 Начальный баланс', {
      description: 'Initial balance check',
      telegram_id: testTelegramId,
      balance: initialBalance,
    })

    // Шаг 2: Добавляем звезды
    const addResult = await updateUserBalance({
      telegram_id: testTelegramId.toString(),
      amount: 100,
      type: 'income',
      operation_description: 'Test add stars',
      bot_name: 'ai_koshey_bot',
    })

    logger.info('➕ Результат добавления звезд', {
      description: 'Add stars result',
      telegram_id: testTelegramId,
      result: addResult,
    })

    // Шаг 3: Проверяем баланс после добавления
    const balanceAfterAdd = await getUserBalance(
      testTelegramId.toString(),
      'ai_koshey_bot'
    )
    logger.info('💰 Баланс после добавления', {
      description: 'Balance after adding stars',
      telegram_id: testTelegramId,
      balance: balanceAfterAdd,
      expected: 100,
    })

    // Шаг 4: Списываем звезды
    const spendResult = await updateUserBalance({
      telegram_id: testTelegramId.toString(),
      amount: 30,
      type: 'outcome',
      operation_description: 'Test spend stars',
      bot_name: 'ai_koshey_bot',
    })

    logger.info('➖ Результат списания звезд', {
      description: 'Spend stars result',
      telegram_id: testTelegramId,
      result: spendResult,
    })

    // Шаг 5: Проверяем финальный баланс
    const finalBalance = await getUserBalance(
      testTelegramId.toString(),
      'ai_koshey_bot'
    )
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
      .eq('telegram_id', testTelegramId.toString())
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
    await supabase
      .from('payments_v2')
      .delete()
      .eq('telegram_id', testTelegramId)

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
