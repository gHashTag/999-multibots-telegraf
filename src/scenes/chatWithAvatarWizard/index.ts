import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussian } from '../../helpers/language'
import { handleTextMessage } from '../../handlers/handleTextMessage'
import { handleHelpCancel } from '@/handlers'

import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { getTranslation } from '@/core/supabase/getTranslation'

import {
  ReplyKeyboardMarkup,
  Message,
} from 'telegraf/typings/core/types/typegram'

// const zepClient = ZepClient.getInstance()

const createHelpCancelKeyboard = (isRu: boolean): ReplyKeyboardMarkup => {
  return {
    keyboard: [
      [{ text: isRu ? 'Отмена' : 'Cancel' }],
      [{ text: isRu ? 'Справка по команде' : 'Help for the command' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  }
}

export const chatWithAvatarWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ChatWithAvatar,
  async ctx => {
    const telegramId = ctx.from?.id
    logger.info('🎯 Entering chat with avatar wizard', {
      description: 'Starting chat wizard first step',
      telegram_id: telegramId,
      session_mode: ctx.session?.mode,
      session_state: ctx.session,
      wizard_state: ctx.wizard?.state,
    })

    if (!telegramId) {
      logger.error('❌ No telegram ID in chat wizard', {
        description: 'Missing telegram ID in chat wizard',
        context: ctx,
      })
      return ctx.scene.leave()
    }

    // Verify we're in the correct mode
    if (ctx.session.mode !== ModeEnum.ChatWithAvatar) {
      logger.error('❌ Incorrect mode in chat wizard', {
        description: 'Mode mismatch in chat wizard',
        expected: ModeEnum.ChatWithAvatar,
        actual: ctx.session.mode,
        telegram_id: telegramId,
        session_state: ctx.session,
      })
      const isRu = isRussian(ctx)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при входе в чат. Пожалуйста, попробуйте снова через главное меню.'
          : '❌ Error entering chat. Please try again through the main menu.'
      )
      return ctx.scene.leave()
    }

    const isRu = isRussian(ctx)

    try {
      logger.info('🗣 Getting welcome message translation', {
        description: 'Fetching chat welcome message',
        telegram_id: telegramId,
        language: isRu ? 'ru' : 'en',
      })

      const startMessage = await getTranslation('chat_with_avatar', ctx)

      const defaultStartMessage = isRu
        ? '👋 Добро пожаловать в чат с аватаром! Я готов общаться с вами. Напишите ваше сообщение, и я постараюсь помочь.'
        : '👋 Welcome to chat with avatar! I am ready to chat with you. Write your message, and I will try to help.'

      logger.info('💬 Sending welcome message', {
        description: 'Preparing to send welcome message',
        telegram_id: telegramId,
        using_default: !startMessage.translation,
        message: startMessage.translation || defaultStartMessage,
      })

      await ctx.reply(startMessage.translation || defaultStartMessage, {
        reply_markup: createHelpCancelKeyboard(isRu),
      })

      logger.info('➡️ Moving to next wizard step', {
        description: 'Transitioning to chat interaction step',
        telegram_id: telegramId,
        session_state: ctx.session,
        wizard_state: ctx.wizard?.state,
      })

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Error in chat wizard start', {
        description: 'Error during chat initialization',
        telegram_id: telegramId,
        error: error instanceof Error ? error.message : String(error),
        session_state: ctx.session,
        wizard_state: ctx.wizard?.state,
      })
      const fallbackMessage = isRu
        ? '👋 Добро пожаловать в чат! Напишите ваше сообщение.'
        : '👋 Welcome to chat! Write your message.'
      await ctx.reply(fallbackMessage)
      return ctx.wizard.next()
    }
  },
  async ctx => {
    const telegramId = ctx.from?.id
    const isRu = isRussian(ctx)

    logger.info('📨 Received message in chat', {
      description: 'Processing user message in chat',
      telegram_id: telegramId,
      message_type: ctx.message && 'text' in ctx.message ? 'text' : 'other',
      session_state: ctx.session,
      wizard_state: ctx.wizard?.state,
    })

    try {
      // Handle help/cancel commands
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        logger.info('🚫 Chat cancelled by user', {
          description: 'User cancelled chat session',
          telegram_id: telegramId,
        })
        return ctx.scene.leave()
      }

      // Process the message
      if (ctx.message && 'text' in ctx.message) {
        const messageText = (ctx.message as Message.TextMessage).text

        logger.info('💬 Processing text message', {
          description: 'Handling text message in chat',
          telegram_id: telegramId,
          message_length: messageText.length,
        })

        // Handle the text message
        await handleTextMessage(ctx)
        return
      }

      logger.warn('⚠️ Unsupported message type', {
        description: 'Received non-text message in chat',
        telegram_id: telegramId,
        message_type: ctx.message ? typeof ctx.message : 'unknown',
      })

      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текстовое сообщение.'
          : '❌ Please send a text message.'
      )
    } catch (error) {
      logger.error('❌ Error processing chat message', {
        description: 'Error in chat message handler',
        telegram_id: telegramId,
        error: error instanceof Error ? error.message : String(error),
        session_state: ctx.session,
        wizard_state: ctx.wizard?.state,
      })

      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке сообщения. Пожалуйста, попробуйте еще раз.'
          : '❌ An error occurred while processing your message. Please try again.'
      )
    }
  }
)

export default chatWithAvatarWizard
