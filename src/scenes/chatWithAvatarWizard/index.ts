import { Scenes } from 'telegraf'
import { MyContext } from '@/types'
import { isRussian } from '../../helpers/language'
import { handleTextMessage } from '../../handlers/handleTextMessage'
import { handleHelpCancel } from '@/handlers'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import { levels } from '@/menu'
import { ModeEnum } from '@/types/modes'
import { inngest } from '@/inngest-functions/clients'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import { ZepClient } from '@/core/zep'
import { createHelpCancelKeyboard } from '@/menu'

export const chatWithAvatarWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ChatWithAvatar,
  async ctx => {
    logger.info('🚀 Начало чата с аватаром:', {
      description: 'Starting chat with avatar',
      telegramId: ctx.from?.id,
    })
    const isRu = isRussian(ctx)

    try {
      await ctx.reply(
        isRu
          ? 'Напиши мне сообщение 💭 или отправь голосовое сообщение 🎙️, и я отвечу на него'
          : 'Write me a message 💭 or send a voice message 🎙️, and I will answer you',
        {
          reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
        }
      )
      logger.info('✅ Приветственное сообщение отправлено:', {
        description: 'Welcome message sent',
        telegramId: ctx.from?.id,
      })
      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Ошибка при отправке приветственного сообщения:', {
        description: 'Error sending welcome message',
        error: error instanceof Error ? error.message : String(error),
        telegramId: ctx.from?.id,
      })
      throw error
    }
  },
  async ctx => {
    logger.info('📝 Получено сообщение в чате с аватаром:', {
      description: 'Message received in avatar chat',
      messageType: ctx.message ? Object.keys(ctx.message)[0] : 'unknown',
      messageKeys: ctx.message ? Object.keys(ctx.message) : [],
      hasVoice: ctx.message && 'voice' in ctx.message,
      hasText: ctx.message && 'text' in ctx.message,
      rawMessage: ctx.message
        ? JSON.stringify(ctx.message, null, 2)
        : 'no message',
      updateType: ctx.updateType,
      telegramId: ctx.from?.id,
    })

    const telegramId = ctx.from?.id?.toString()

    if (!ctx.message) {
      logger.warn('⚠️ Пустое сообщение:', {
        description: 'Empty message received',
        telegramId,
      })
      return
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      logger.info('🛑 Пользователь отменил чат:', {
        description: 'User cancelled chat',
        telegramId: ctx.from?.id,
      })
      return ctx.scene.leave()
    }

    const isRu = isRussian(ctx)

    if (!telegramId) {
      logger.error('❌ Не удалось получить ID пользователя:', {
        description: 'Failed to get user ID',
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
        telegramId,
      })
      await ctx.reply(
        isRu ? '❌ Ошибка: пользователь не найден' : '❌ Error: User not found'
      )
      return ctx.scene.leave()
    }

    // Подробное логирование структуры сообщения
    const messageStructure = {
      updateType: ctx.updateType,
      messageKeys: Object.keys(ctx.message),
      messageId: ctx.message.message_id,
      from: ctx.message.from,
      allFields: {
        hasVoice: 'voice' in ctx.message,
        hasText: 'text' in ctx.message,
        hasPhoto: 'photo' in ctx.message,
        hasDocument: 'document' in ctx.message,
        hasAudio: 'audio' in ctx.message,
        hasSticker: 'sticker' in ctx.message,
        hasVideo: 'video' in ctx.message,
      },
      date: ctx.message.date,
      fullMessage: JSON.stringify(ctx.message, null, 2),
    }

    logger.info('📩 Структура входящего сообщения:', {
      description: 'Incoming message structure',
      ...messageStructure,
      telegramId,
    })

    // Проверяем тип сообщения через оператор in
    const isVoiceMessage = 'voice' in ctx.message
    const isTextMessage = 'text' in ctx.message

    logger.info('🔍 Определен тип сообщения:', {
      description: 'Message type detected',
      isVoiceMessage,
      isTextMessage,
      voiceData: isVoiceMessage ? ctx.message.voice : null,
      textData: isTextMessage ? ctx.message.text : null,
      telegramId,
    })

    // Проверяем, является ли сообщение запросом справки
    if (
      isTextMessage &&
      'text' in ctx.message &&
      ctx.message.text === (isRu ? levels[6].title_ru : levels[6].title_en)
    ) {
      logger.info('ℹ️ Пользователь запросил справку:', {
        description: 'User requested help',
        telegramId,
      })
      await ctx.scene.enter(ModeEnum.SelectModelWizard)
      return
    }

    // Если это голосовое сообщение, обрабатываем его первым
    if (isVoiceMessage && 'voice' in ctx.message) {
      const voice = ctx.message.voice
      logger.info('🎙️ Обнаружено голосовое сообщение:', {
        description: 'Voice message detected',
        voiceProperties: {
          duration: voice.duration,
          mime_type: voice.mime_type,
          file_id: voice.file_id,
          file_size: voice.file_size,
        },
        telegramId,
      })

      try {
        // Получаем файл голосового сообщения
        const file = await ctx.telegram.getFileLink(voice.file_id)
        logger.info('📁 Получена ссылка на файл:', {
          description: 'Got file link',
          telegramId,
          fileUrl: file.href,
          fileProperties: JSON.stringify(file, null, 2),
        })

        if (!file.href) {
          throw new Error('File path not found')
        }

        // Отправляем уведомление о начале обработки
        await ctx.reply(
          isRu
            ? '🎙️ Обрабатываю ваше голосовое сообщение...'
            : '🎙️ Processing your voice message...'
        )

        // Отправляем событие для распознавания речи
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

        return
      } catch (error) {
        logger.error('❌ Ошибка при обработке голосового сообщения:', {
          description: 'Error processing voice message',
          error: error instanceof Error ? error.message : String(error),
          telegramId,
        })
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при обработке голосового сообщения'
            : '❌ An error occurred while processing your voice message'
        )
        return
      }
    }

    // Обработка текстового сообщения
    if ('text' in ctx.message && isTextMessage) {
      const text = ctx.message.text
      const zepClient = ZepClient.getInstance()
      const sessionId = `${telegramId || ''}_${ctx.botInfo?.username || ''}`

      // Сохраняем сообщение пользователя
      await zepClient.addMessage(sessionId, 'user', text)

      // Получаем историю чата
      const memory = await zepClient.getMemory(sessionId)
      const chatHistory = memory?.messages || []

      // Формируем контекст для модели
      const context = chatHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      }))
      console.log('🔍 Контекст:', context)

      // Отправляем запрос к модели с историей
      const response = await handleTextMessage(ctx)

      // Сохраняем ответ ассистента
      if (typeof response === 'string') {
        await zepClient.addMessage(sessionId, 'assistant', response)
      }

      try {
        logger.info('🤖 Обработка текстового сообщения:', {
          description: 'Processing text message',
          telegramId,
        })
        await ctx.telegram.sendChatAction(Number(telegramId), 'typing')
        await handleTextMessage(ctx)

        // Обновляем уровень пользователя если нужно
        if (user.level === 4) {
          logger.info('📈 Обновление уровня пользователя:', {
            description: 'Updating user level',
            telegramId,
            currentLevel: user.level,
          })

          try {
            await updateUserLevelPlusOne(telegramId, user.level)
            logger.info('✅ Уровень пользователя обновлен:', {
              description: 'User level updated',
              telegramId,
              newLevel: user.level + 1,
            })
          } catch (error) {
            logger.error('❌ Ошибка при обновлении уровня пользователя:', {
              description: 'Error updating user level',
              error: error instanceof Error ? error.message : String(error),
              telegramId,
            })
          }
        }
      } catch (error) {
        logger.error('❌ Ошибка при обработке текстового сообщения:', {
          description: 'Error processing text message',
          error: error instanceof Error ? error.message : String(error),
          telegramId,
        })
        throw error
      }
      return
    }

    // Если тип сообщения не поддерживается
    if (!isTextMessage && !isVoiceMessage) {
      logger.warn('⚠️ Неподдерживаемый тип сообщения:', {
        description: 'Unsupported message type',
        telegramId,
        messageType: Object.keys(ctx.message)[0],
      })
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текстовое или голосовое сообщение'
          : '❌ Please send a text or voice message'
      )
    }
  }
)
export default chatWithAvatarWizard
