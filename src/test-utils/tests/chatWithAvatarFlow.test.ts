import { Telegraf, Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { supabase } from '@/core/supabase'
import { Logger as logger } from '@/utils/logger'
import { TEST_CONFIG } from '../test-config'
import { v4 as uuid } from 'uuid'
import { TestResult } from '../types'

async function cleanupTestUser(telegram_id: string) {
  try {
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

export async function testChatWithAvatarFlow(): Promise<TestResult> {
  const testTelegramId = Date.now().toString()
  const testUsername = `test_user_${testTelegramId}`

  try {
    logger.info('🚀 Начало тестирования flow чата с аватаром', {
      description: 'Starting chat with avatar flow test',
      telegram_id: testTelegramId,
      username: testUsername,
    })

    // 1. Создаем тестового пользователя
    const { error: createError } = await supabase.from('users').insert({
      telegram_id: testTelegramId,
      username: testUsername,
      bot_name: TEST_CONFIG.TEST_BOT_NAME,
      balance: 1000, // Достаточный баланс для тестирования
      mode: ModeEnum.ChatWithAvatar,
    })

    if (createError) {
      throw new Error(`Ошибка создания пользователя: ${createError.message}`)
    }

    // 2. Создаем тестовый контекст
    const mockContext = {
      from: {
        id: parseInt(testTelegramId),
        username: testUsername,
        first_name: 'Test',
        is_bot: false,
      },
      chat: {
        id: parseInt(testTelegramId),
      },
      session: {
        mode: ModeEnum.ChatWithAvatar,
      },
      scene: {
        enter: async (sceneName: string) => {
          logger.info('🎬 Вход в сцену', {
            description: 'Entering scene',
            scene: sceneName,
          })
          return Promise.resolve()
        },
      },
      reply: async (text: string) => {
        logger.info('💬 Ответ бота', {
          description: 'Bot reply',
          text,
        })
        return Promise.resolve()
      },
    } as unknown as MyContext

    // 3. Тестируем вход в сцену проверки баланса
    await mockContext.scene.enter(ModeEnum.CheckBalanceScene)

    // 4. Проверяем, что пользователь успешно переходит в чат с аватаром
    const { data: userData } = await supabase
      .from('users')
      .select('mode')
      .eq('telegram_id', testTelegramId)
      .single()

    if (userData?.mode !== ModeEnum.ChatWithAvatar) {
      throw new Error(
        `Неверный режим после входа в чат. Ожидалось: ${ModeEnum.ChatWithAvatar}, Получено: ${userData?.mode}`
      )
    }

    // 5. Тестируем отправку сообщения в чат
    const testMessage = 'Привет, аватар!'
    await mockContext.reply(testMessage)

    // Очистка тестовых данных
    if (TEST_CONFIG.cleanupAfterEach) {
      await cleanupTestUser(testTelegramId)
    }

    return {
      success: true,
      name: 'Chat with Avatar Flow Test',
      message: 'Тест flow чата с аватаром успешно завершен',
    }
  } catch (error) {
    logger.error('❌ Ошибка в тесте flow чата с аватаром:', {
      description: 'Error in chat with avatar flow test',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      name: 'Chat with Avatar Flow Test',
      message: `Ошибка в тесте flow чата с аватаром: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

export const runAllChatWithAvatarTests = async (): Promise<TestResult[]> => {
  logger.info('🚀 Запуск всех тестов чата с аватаром', {
    description: 'Running all chat with avatar tests',
  })

  const results: TestResult[] = []

  try {
    const flowTestResult = await testChatWithAvatarFlow()
    results.push(flowTestResult)

    logger.info('✅ Все тесты чата с аватаром завершены', {
      description: 'All chat with avatar tests completed',
      success_count: results.filter(r => r.success).length,
      fail_count: results.filter(r => !r.success).length,
    })

    return results
  } catch (error) {
    logger.error('❌ Ошибка при запуске тестов чата с аватаром:', {
      description: 'Error running chat with avatar tests',
      error: error instanceof Error ? error.message : String(error),
    })
    return [
      {
        success: false,
        name: 'Chat with Avatar Tests',
        message: `Ошибка при запуске тестов чата с аватаром: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    ]
  }
} 