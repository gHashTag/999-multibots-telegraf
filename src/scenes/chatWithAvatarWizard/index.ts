import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussian } from '../../helpers/language'
import { handleTextMessage } from '../../handlers/handleTextMessage'
import { handleHelpCancel } from '@/handlers'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { levels } from '@/menu'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { inngest } from '@/inngest-functions/clients'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { Logger as logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { ZepClient } from '@/core/zep'
import { getTranslation } from '@/core/supabase/getTranslation'

const zepClient = ZepClient.getInstance()

const createHelpCancelKeyboard = (isRu: boolean) => {
  return {
    keyboard: [
      [{ text: isRu ? levels[6].title_ru : levels[6].title_en }],
      [{ text: isRu ? 'Отмена' : 'Cancel' }],
      [{ text: isRu ? 'Справка по команде' : 'Help for the command' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  }
}

export const chatWithAvatarWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ChatWithAvatar,
  async (ctx) => {
    const telegramId = ctx.from?.id
    if (!telegramId) {
      logger.error('No telegram id found in context')
      return ctx.scene.leave()
    }

    const isRu = isRussian(ctx)
    try {
      const startMessage = await getTranslation('chat_with_avatar_start', ctx)

      const defaultStartMessage = isRu 
        ? '👋 Добро пожаловать в чат с аватаром! Я готов общаться с вами. Напишите ваше сообщение, и я постараюсь помочь.'
        : '👋 Welcome to chat with avatar! I am ready to chat with you. Write your message, and I will try to help.'

      await ctx.reply(startMessage.translation || defaultStartMessage)
    } catch (error) {
      logger.error('Error getting start translation', {
        error: error instanceof Error ? error.message : String(error),
        telegramId
      })
      const fallbackMessage = isRu
        ? '👋 Добро пожаловать в чат! Напишите ваше сообщение.'
        : '👋 Welcome to chat! Write your message.'
      await ctx.reply(fallbackMessage)
    }
    return ctx.wizard.next()
  },
  async (ctx) => {
    const telegramId = ctx.from?.id
    if (!telegramId) {
      logger.error('No telegram id found in context')
      return ctx.scene.leave()
    }

    if (!ctx.message) {
      logger.error('No message found in context')
      return ctx.scene.leave()
    }

    // Handle user cancellation
    if ('text' in ctx.message && ctx.message.text === '/cancel') {
      logger.info('User cancelled chat', { telegramId })
      const cancelMessage = isRussian(ctx) 
        ? '❌ Чат завершен'
        : '❌ Chat cancelled'
      await ctx.reply(cancelMessage)
      return ctx.scene.leave()
    }

    // Handle help request
    if ('text' in ctx.message && ctx.message.text === '/help') {
      const isRu = isRussian(ctx)
      try {
        const helpMessage = await getTranslation('chat_with_avatar_help', ctx)
        
        const defaultHelpMessage = isRu
          ? '💡 Это чат с аватаром. Вы можете:\n- Написать сообщение для общения\n- Использовать /cancel для завершения\n- Использовать /help для помощи'
          : '💡 This is chat with avatar. You can:\n- Write a message to chat\n- Use /cancel to end chat\n- Use /help for assistance'

        await ctx.reply(helpMessage.translation || defaultHelpMessage)
      } catch (error) {
        logger.error('Error getting help translation', {
          error: error instanceof Error ? error.message : String(error),
          telegramId
        })
        const fallbackMessage = isRu
          ? '💡 Это чат с аватаром. Используйте /cancel для завершения.'
          : '💡 This is chat with avatar. Use /cancel to end.'
        await ctx.reply(fallbackMessage)
      }
      return
    }

    try {
      await ctx.telegram.sendChatAction(Number(telegramId), 'typing')

      // Save user message
      const sessionId = `telegram:${telegramId}`
      if ('text' in ctx.message) {
        await zepClient.saveMemory(sessionId, {
          messages: [{
            role: 'user',
            content: ctx.message.text
          }]
        })
      }

      // Get chat history and generate response
      const history = await zepClient.getMemory(sessionId)
      
      // Process response and save it
      const response = 'This is a placeholder response' // Replace with actual response generation
      await zepClient.saveMemory(sessionId, {
        messages: [{
          role: 'assistant',
          content: response
        }]
      })

      await ctx.reply(response)
    } catch (error) {
      logger.error('Error in chat processing', { 
        error: error instanceof Error ? error.message : String(error),
        telegramId 
      })
      await ctx.reply('Sorry, there was an error processing your message')
    }

    return
  }
)

export default chatWithAvatarWizard
