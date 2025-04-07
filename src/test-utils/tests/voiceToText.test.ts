import { TEST_CONFIG } from '../test-config'
import { TestResult } from '../types'
import { logger } from '@/utils/logger'
import { getUserByTelegramIdString } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'
import { normalizeTelegramId } from '@/interfaces/telegram.interface'
import { createUser } from '@/core/supabase/createUser'
import { InngestTestEngine } from '../inngest-test-engine'
import { voiceToTextProcessor } from '@/inngest-functions/voiceToText.inngest'

/**
 * Тест для проверки функциональности распознавания голоса
 */
export async function testVoiceToText(): Promise<TestResult> {
  const testName = 'Voice to Text Test'
  logger.info(`🚀 Starting ${testName}`)

  // Создаем уникальный ID для тестового пользователя
  const testTelegramId = normalizeTelegramId(Date.now())
  const testUsername = `test_user_${testTelegramId}`

  try {
    // Создаем тестового пользователя
    await createUser({
      telegram_id: testTelegramId,
      username: testUsername,
      bot_name: TEST_CONFIG.bots.test_bot.name,
      level: 5,
      mode: ModeEnum.VoiceToText,
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

    // Создаем тестовый движок Inngest
    const inngestTestEngine = new InngestTestEngine()
    inngestTestEngine.register('voice-to-text.requested', voiceToTextProcessor)

    // Создаем тестовое голосовое сообщение
    const testVoiceMessage = {
      fileUrl: 'https://example.com/test.ogg',
      telegram_id: testTelegramId.toString(),
      is_ru: true,
      bot_name: TEST_CONFIG.bots.test_bot.name,
      username: testUsername,
    }

    // Отправляем событие в Inngest
    const result = await inngestTestEngine.send({
      name: 'voice-to-text.requested',
      data: testVoiceMessage,
    })

    if (!result.success) {
      throw new Error('❌ Failed to process voice message')
    }

    logger.info('✅ Voice to Text test completed successfully')
    return {
      success: true,
      name: testName,
      message: 'Voice to Text functionality works correctly',
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