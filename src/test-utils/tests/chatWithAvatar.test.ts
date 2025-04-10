import { TEST_CONFIG } from '../test-config'
import { TestResult } from '../types'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { InngestTestEngine } from '../inngest/inngest-test-engine'
import { voiceToTextFunction } from '@/inngest-functions/voiceToText'
import { paymentProcessor } from '@/inngest-functions/paymentProcessor'

import { handleTextMessage } from '@/handlers/handleTextMessage'
import { MyContext } from '@/types'

import { createUser } from '@/core/supabase/createUser'
import * as fs from 'fs'
import * as path from 'path'

// Минимальный заголовок OGG файла (OggS + версия + тип заголовка)
const OGG_HEADER = Buffer.from([
  0x4f,
  0x67,
  0x67,
  0x53, // OggS
  0x00, // Версия
  0x02, // Тип заголовка
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00, // Гранулированная позиция
  0x00,
  0x00,
  0x00,
  0x00, // Серийный номер
  0x00,
  0x00,
  0x00,
  0x00, // Порядковый номер страницы
  0x01, // Контрольная сумма
  0x01, // Количество сегментов
  0x1e, // Размер сегмента
  // Минимальные аудио данные
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
])

interface TextMessageEvent {
  telegram_id: string
  text: string
  bot_name: string
}

/**
 * Тест для проверки функциональности чата с аватаром
 */
export async function testChatWithAvatar(): Promise<TestResult> {
  const testName = 'Chat with Avatar Test'
  try {
    // Создаем тестового пользователя
    const telegram_id = '123456789'
    const username = 'test_user'
    const user = await createUser({
      telegram_id,
      username,
      language_code: 'en',
      bot_name: 'test_bot',
    })

    if (!user) {
      throw new Error('User was not created')
    }

    // Создаем тестовый аудио файл
    const testAudioPath = path.join(__dirname, 'test_voice.ogg')
    fs.writeFileSync(testAudioPath, OGG_HEADER)

    // Инициализируем тестовый движок
    const testEngine = new InngestTestEngine({
      maxWaitTime: 30000,
      eventBufferSize: 200,
    })

    // Регистрируем обработчики
    testEngine.register(
      'text-message.requested',
      async ({ event }: { event: TextMessageEvent }) => {
        try {
          const ctx = {
            update: {
              message: {
                text: event.text,
                chat: {
                  id: event.telegram_id,
                  type: 'private',
                },
                from: {
                  id: event.telegram_id,
                  username: 'test_user',
                  language_code: 'en',
                },
                message_id: 1,
              },
            },
            telegram: {
              token: 'test_token',
              sendMessage: async (
                chatId: string | number,
                text: string,
                options?: any
              ) => {
                logger.info('🤖 Отправка сообщения', { text, options, chatId })
                return { message_id: 1 }
              },
            },
            botInfo: {
              username: 'test_bot',
            },
            state: {},
            chat: {
              id: event.telegram_id,
              type: 'private',
            },
            from: {
              id: event.telegram_id,
              username: 'test_user',
              language_code: 'en',
            },
            message: {
              text: event.text,
              chat: {
                id: event.telegram_id,
                type: 'private',
              },
              from: {
                id: event.telegram_id,
                username: 'test_user',
                language_code: 'en',
              },
              message_id: 1,
            },
            reply: async (text: string) => {
              logger.info('🤖 Отправка сообщения', { text })
              return { message_id: 1 }
            },
          } as unknown as MyContext

          await handleTextMessage(ctx)
        } catch (error) {
          logger.error('❌ Error in text message handler:', { error })
          throw error
        }
      }
    )
    console.log('🔄 Регистрация обработчиков')
    testEngine.register('voice-to-text.requested', voiceToTextFunction)
    testEngine.register('payment/process', paymentProcessor)

    // Отправляем текстовое сообщение
    await testEngine.send({
      name: 'text-message.requested',
      data: {
        telegram_id,
        text: '/start',
        bot_name: 'test_bot',
      },
    })

    // Отправляем голосовое сообщение
    await testEngine.send({
      name: 'voice-to-text.requested',
      data: {
        telegram_id,
        fileUrl: `file://${testAudioPath}`,
        bot_name: 'test_bot',
      },
    })

    // Cleanup test data if configured
    if (TEST_CONFIG.mockBot) {
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('telegram_id', telegram_id)

      if (deleteError) {
        logger.error('❌ Failed to cleanup test data:', { error: deleteError })
      }
    }

    // Удаляем тестовый файл
    if (fs.existsSync(testAudioPath)) {
      fs.unlinkSync(testAudioPath)
    }

    return {
      name: testName,
      success: true,
      message: 'Chat with avatar test completed successfully',
    }
  } catch (error) {
    logger.error('❌ Chat with avatar test failed:', { error })
    return {
      name: testName,
      success: false,
      message:
        error instanceof Error ? error.message : 'Unknown error occurred',
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}
