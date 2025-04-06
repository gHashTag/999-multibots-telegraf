import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

async function testAddStarsToBalance() {
  const testTelegramId = 123456789
  const testStars = 10
  const testDescription = 'Test add stars'
  const testBotName = 'test_bot'

  try {
    logger.info('🚀 Начинаем тест add_stars_to_balance:', {
      description: 'Starting add_stars_to_balance test',
      telegram_id: testTelegramId.toString(),
      stars: testStars,
      bot_name: testBotName,
    })

    // Вызываем функцию add_stars_to_balance
    const { data: result, error } = await supabase.rpc('add_stars_to_balance', {
      p_telegram_id: testTelegramId,
      p_stars: testStars,
      p_description: testDescription,
      p_bot_name: testBotName,
    })

    if (error) {
      logger.error('❌ Ошибка при вызове add_stars_to_balance:', {
        description: 'Error calling add_stars_to_balance',
        error: error.message,
        error_details: error,
      })
      throw error
    }

    logger.info('✅ Результат add_stars_to_balance:', {
      description: 'add_stars_to_balance result',
      result,
    })

    // Проверяем баланс через get_user_balance
    const { data: balance, error: balanceError } = await supabase.rpc(
      'get_user_balance',
      {
        user_telegram_id: testTelegramId,
      }
    )

    if (balanceError) {
      logger.error('❌ Ошибка при получении баланса:', {
        description: 'Error getting balance',
        error: balanceError.message,
        error_details: balanceError,
      })
      throw balanceError
    }

    logger.info('✅ Текущий баланс:', {
      description: 'Current balance',
      balance,
    })

    return { success: true, result, balance }
  } catch (error) {
    logger.error('❌ Ошибка в тесте:', {
      description: 'Test error',
      error: error instanceof Error ? error.message : String(error),
      error_details: error,
    })
    return { success: false, error }
  }
}

// Запускаем тест
testAddStarsToBalance().then(result => {
  logger.info('🏁 Тест завершен:', {
    description: 'Test completed',
    result,
  })
})
