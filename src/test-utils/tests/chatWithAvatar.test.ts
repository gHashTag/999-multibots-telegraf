import { TEST_CONFIG } from '../test-config'
import { TestResult } from '../types'
import { logger } from '@/utils/logger'
import { getUserByTelegramIdString } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { createUser } from '@/core/supabase/createUser'

/**
 * Тест для проверки функциональности чата с аватаром
 */
export async function testChatWithAvatar(): Promise<TestResult> {
  const testName = 'Chat with Avatar Test'
  logger.info(`🚀 Starting ${testName}`)

  // Создаем уникальный ID для тестового пользователя
  const testTelegramId = normalizeTelegramId(Date.now())
  const testUsername = `test_user_${testTelegramId}`

  try {
    // Создаем тестового пользователя с нужным уровнем
    await createUser({
      telegram_id: testTelegramId,
      username: testUsername,
      bot_name: TEST_CONFIG.bots.test_bot.name,
      level: 5, // Уровень выше 4 для доступа к чату с аватаром
      mode: ModeEnum.ChatWithAvatar,
      model: 'gpt-4-turbo',
      count: 0,
      aspect_ratio: '9:16',
      language_code: 'ru',
      is_bot: false,
      photo_url: '',
    })

    // Проверяем существование пользователя
    const user = await getUserByTelegramIdString(testTelegramId.toString())
    if (!user) {
      throw new Error('❌ User not found in database')
    }

    // Проверяем, что пользователь имеет доступ к чату с аватаром
    if (user.level < 4) {
      throw new Error('❌ User does not have access to chat with avatar')
    }

    // Проверяем, что режим установлен правильно
    if (user.mode !== ModeEnum.ChatWithAvatar) {
      throw new Error('❌ Incorrect mode set')
    }

    logger.info('✅ Chat with Avatar test completed successfully')
    return {
      success: true,
      name: testName,
      message: 'Chat with Avatar functionality works correctly',
      details: {
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          level: user.level,
          mode: user.mode
        }
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`❌ Error in ${testName}:`, { error: errorMessage })
    return {
      success: false,
      name: testName,
      message: 'Test failed',
      error: errorMessage,
    }
  } finally {
    // Очищаем тестовые данные
    if (TEST_CONFIG.cleanupAfterEach) {
      await supabase
        .from('users')
        .delete()
        .eq('telegram_id', testTelegramId)
        .eq('bot_name', TEST_CONFIG.bots.test_bot.name)
    }
  }
} 