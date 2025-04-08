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
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { ZepClient } from '@/core/zep'

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
  async ctx => {
    logger.info('🚀 Начало чата с аватаром:', {
      description: 'Starting chat with avatar',
      telegramId: ctx.from?.id
    })
    const isRu = isRussian(ctx)

    try {
      await ctx.reply(
        isRu
          ? 'Напиши мне сообщение 💭 или отправь голосовое сообщение 🎙️, и я отвечу на него'
          : 'Write me a message 💭 or send a voice message 🎙️, and I will answer you',
        {
          reply_markup: createHelpCancelKeyboard(isRu),
        }
      )
      logger.info('✅ Приветственное сообщение отправлено:', {
        description: 'Welcome message sent',
        telegramId: ctx.from?.id
      })
      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Ошибка при отправке приветственного сообщения:', {
        description: 'Error sending welcome message',
        error: error instanceof Error ? error.message : String(error),
        telegramId: ctx.from?.id
      })
      throw error
    }
  },
  async ctx => {
    logger.info('📝 Получено сообщение в чате с аватаром:', {
      description: 'Message received in avatar chat',
      telegramId: ctx.from?.id,
      messageType: ctx.message ? Object.keys(ctx.message)[0] : 'unknown'
    })
    
    if (!ctx.message) {
      logger.warn('⚠️ Получено пустое сообщение:', {
        description: 'Empty message received',
        telegramId: ctx.from?.id
      })
      return ctx.scene.leave()
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      logger.info('🛑 Пользователь отменил чат:', {
        description: 'User cancelled chat',
        telegramId: ctx.from?.id
      })
      return ctx.scene.leave()
    }

    const isRu = isRussian(ctx)
    const telegramId = ctx.from?.id.toString()

    if (!telegramId) {
      logger.error('❌ Не удалось получить ID пользователя:', {
        description: 'Failed to get user ID'
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось получить ID пользователя'
          : '❌ Error: User ID not found'
      )
      return ctx.scene.leave()
    }

    // Проверяем существование пользователя
    const user = await getUserByTelegramIdString(telegramId)
    if (!user) {
      logger.error('❌ Пользователь не найден:', {
        description: 'User not found',
        telegramId
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка: пользователь не найден'
          : '❌ Error: User not found'
      )
      return ctx.scene.leave()
    }

    // Проверяем, является ли сообщение запросом справки
    if ('text' in ctx.message && ctx.message.text === (isRu ? levels[6].title_ru : levels[6].title_en)) {
      logger.info('ℹ️ Пользователь запросил справку:', {
        description: 'User requested help',
        telegramId
      })
      await ctx.scene.enter(ModeEnum.SelectModelWizard)
      return
    }
    const text = ctx.message.text
    const zepClient = ZepClient.getInstance()
    const sessionId = `${ctx.from.id}_${ctx.botInfo?.username}`
  
    // Сохраняем сообщение пользователя
    await zepClient.addMessage(sessionId, 'user', text)
  
    // Получаем историю чата
    const memory = await zepClient.getMemory(sessionId)
    const chatHistory = memory?.messages || []
  
    // Формируем контекст для модели
    const context = chatHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }))
  
    // Отправляем запрос к модели с историей
    const response = await handleTextMessage(ctx, text, context)
  
    // Сохраняем ответ ассистента
    await zepClient.addMessage(sessionId, 'assistant', response)
  
    try {
      // Обработка текстового сообщения
      if ('text' in ctx.message) {
        logger.info('🤖 Обработка текстового сообщения:', {
          description: 'Processing text message',
          telegramId
        })
        await ctx.telegram.sendChatAction(Number(telegramId), 'typing')
        await handleTextMessage(ctx)
      }
      // Обработка голосового сообщения
      else if ('voice' in ctx.message) {
        logger.info('🎙️ Обработка голосового сообщения:', {
          description: 'Processing voice message',
          telegramId
        })
        
        // Получаем файл голосового сообщения
        const file = await ctx.telegram.getFileLink(ctx.message.voice.file_id)
        if (!file.href) {
          throw new Error('File path not found')
        }

        // Отправляем уведомление о начале обработки
        await ctx.reply(
          isRu
            ? '🎙️ Обрабатываю ваше голосовое сообщение...'
            : '🎙️ Processing your voice message...'
        )

        // Отправляем событие в Inngest для обработки
        await inngest.send({
          id: `voice-to-text-${telegramId}-${Date.now()}-${uuidv4().substring(0, 8)}`,
          name: 'voice-to-text.requested',
          data: {
            fileUrl: file.href,
            telegram_id: telegramId,
            is_ru: isRu,
            bot_name: ctx.botInfo?.username,
            username: ctx.from?.username,
          },
        })

        // Отправляем событие для обработки платежа
        await inngest.send({
          id: `payment-${telegramId}-${Date.now()}-${ModeEnum.VoiceToText}-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id: telegramId,
            amount: calculateModeCost({ mode: ModeEnum.VoiceToText }).stars,
            type: 'money_expense',
            description: 'Payment for voice to text conversion',
            bot_name: ctx.botInfo?.username,
            service_type: ModeEnum.VoiceToText,
          },
        })
      }
      // Обработка неподдерживаемого типа сообщения
      else {
        logger.warn('⚠️ Неподдерживаемый тип сообщения:', {
          description: 'Unsupported message type',
          telegramId,
          messageType: Object.keys(ctx.message)[0]
        })
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, отправьте текстовое или голосовое сообщение'
            : '❌ Please send a text or voice message'
        )
        return
      }

      // Обновляем уровень пользователя если нужно
      if (user.level === 4) {
        logger.info('📈 Обновление уровня пользователя:', {
          description: 'Updating user level',
          telegramId,
          currentLevel: user.level
        })
        
        try {
          await updateUserLevelPlusOne(telegramId, user.level)
          logger.info('✅ Уровень пользователя обновлен:', {
            description: 'User level updated',
            telegramId,
            newLevel: user.level + 1
          })
        } catch (error) {
          logger.error('❌ Ошибка при обновлении уровня пользователя:', {
            description: 'Error updating user level',
            error: error instanceof Error ? error.message : String(error),
            telegramId
          })
        }
      }

      return
    } catch (error) {
      logger.error('❌ Ошибка в чате с аватаром:', {
        description: 'Error in avatar chat',
        error: error instanceof Error ? error.message : String(error),
        telegramId
      })
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при обработке сообщения. Пожалуйста, попробуйте позже.'
          : 'An error occurred while processing your message. Please try again later.'
      )
      return ctx.scene.leave()
    }
  }
)

export default chatWithAvatarWizard
