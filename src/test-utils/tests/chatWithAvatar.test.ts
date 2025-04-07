import { TEST_CONFIG } from '../test-config'
import { TestResult } from '../types'
import { logger } from '@/utils/logger'
import { supabase } from '@/core/supabase'
import { InngestTestEngine } from '../inngest-test-engine'
import { voiceToTextProcessor } from '@/inngest-functions/voiceToText.inngest'
import { paymentProcessor } from '@/inngest-functions/paymentProcessor'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { handleTextMessage } from '@/handlers/handleTextMessage'
import { Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { createUser } from '@/core/supabase/createUser'

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
    // Create test user
    const telegramId = '123456789'
    const user = await createUser({
      telegram_id: telegramId,
      username: 'test_user',
      language_code: 'en',
      bot_name: 'test_bot',
    })

    if (!user) {
      throw new Error('User was not created')
    }

    // Initialize test engine
    const inngestTestEngine = new InngestTestEngine({
      maxWaitTime: 30000,
      eventBufferSize: 200,
    })

    // Register handlers
    inngestTestEngine.register('text-message.requested', async ({ event }: { event: TextMessageEvent }) => {
      try {
        const ctx = {
          from: {
            id: parseInt(event.telegram_id),
            username: 'test_user',
            language_code: 'en',
          },
          message: {
            text: event.text,
            chat: {
              id: parseInt(event.telegram_id),
            },
          },
          reply: async (text: string) => {
            logger.info('🤖 Отправка сообщения', { text })
            return { message_id: 1 }
          },
        } as Context<Update>

        await handleTextMessage(ctx)
      } catch (error) {
        logger.error('❌ Error in text message handler:', { error })
        throw error
      }
    })
    inngestTestEngine.register('voice-to-text.requested', voiceToTextProcessor)
    inngestTestEngine.register('payment/process', paymentProcessor)

    // Test text message processing
    const textMessageEvent = {
      name: 'text-message.requested',
      data: {
        telegram_id: telegramId,
        text: '/start',
        bot_name: 'test_bot',
      },
    }
    const textMessageResult = await inngestTestEngine.send(textMessageEvent)
    if (!textMessageResult.success) {
      throw new Error(`Text message processing failed: ${textMessageResult.error}`)
    }

    // Test voice message processing
    const voiceMessageEvent = {
      name: 'voice-to-text.requested',
      data: {
        telegram_id: telegramId,
        file_id: 'test_file_id',
        bot_name: 'test_bot',
      },
    }
    const voiceMessageResult = await inngestTestEngine.send(voiceMessageEvent)
    if (!voiceMessageResult.success) {
      throw new Error(`Voice message processing failed: ${voiceMessageResult.error}`)
    }

    // Check user balance
    const { data: updatedUser, error: balanceError } = await supabase
      .from('users')
      .select()
      .eq('telegram_id', telegramId)
      .single()

    if (balanceError) {
      throw new Error(`Failed to check user balance: ${balanceError.message}`)
    }

    // Cleanup test data if configured
    if (TEST_CONFIG.mockBot) {
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('telegram_id', telegramId)

      if (deleteError) {
        logger.error('❌ Failed to cleanup test data:', { error: deleteError })
      }
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
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
} 