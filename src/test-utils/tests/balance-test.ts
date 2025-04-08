import { TEST_CONFIG } from '../test-config'
import { TestResult } from '../interfaces'
import { getUserBalance } from '../../core/supabase/getUserBalance'
import { logger } from '../../utils/logger'

/**
 * Тест функции getUserBalance
 */
export const runBalanceTest = async (): Promise<TestResult> => {
  const testName = '🏦 Test getUserBalance'
  const startTime = Date.now()

  try {
    logger.info('🚀 Starting balance test', {
      description: 'Testing getUserBalance function',
    })

    // Тест 1: Получение баланса существующего пользователя
    const balance = await getUserBalance(
      TEST_CONFIG.TEST_USER_ID,
      TEST_CONFIG.TEST_BOT_NAME
    )

    logger.info('✅ Balance retrieved successfully', {
      balance,
      user_id: TEST_CONFIG.TEST_USER_ID,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
    })

    // Тест 2: Получение баланса несуществующего пользователя
    const nonExistentBalance = await getUserBalance(
      '999999999',
      TEST_CONFIG.TEST_BOT_NAME
    )

    if (nonExistentBalance !== 0) {
      throw new Error('Non-existent user should have 0 balance')
    }

    logger.info('✅ Non-existent user test passed', {
      balance: nonExistentBalance,
    })

    return {
      name: testName,
      success: true,
      message: '✅ Balance tests completed successfully',
      startTime,
    }
  } catch (error) {
    logger.error('❌ Balance test failed', { error })

    return {
      name: testName,
      success: false,
      message: '❌ Balance test failed',
      error: error instanceof Error ? error : new Error(String(error)),
      startTime,
    }
  }
}
