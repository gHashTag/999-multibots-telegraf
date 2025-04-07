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
    console.log('🚀 Начало чата с аватаром [Starting chat with avatar]')
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
      console.log('✅ Приветственное сообщение отправлено [Welcome message sent]')
      return ctx.wizard.next()
    } catch (error) {
      console.error('❌ Ошибка при отправке приветственного сообщения:', error)
      throw error
    }
  },
  async ctx => {
    console.log('📝 Получено сообщение в чате с аватаром [Message received in avatar chat]')
    
    if (!ctx.message) {
      console.log('⚠️ Получено пустое сообщение [Empty message received]')
      return ctx.scene.leave()
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      console.log('🛑 Пользователь отменил чат [User cancelled chat]')
      return ctx.scene.leave()
    }

    const isRu = isRussian(ctx)

    // Проверяем, является ли сообщение запросом справки
    if ('text' in ctx.message && ctx.message.text === (isRu ? levels[6].title_ru : levels[6].title_en)) {
      console.log('ℹ️ Пользователь запросил справку [User requested help]')
      ctx.session.mode = ModeEnum.SelectModelWizard
      await ctx.scene.enter('checkBalanceScene')
      return
    }

    try {
      // Обработка текстового сообщения
      if ('text' in ctx.message) {
        console.log('🤖 Обработка текстового сообщения [Processing text message]')
        await handleTextMessage(ctx)
      }
      // Обработка голосового сообщения
      else if ('voice' in ctx.message) {
        console.log('🎙️ Обработка голосового сообщения [Processing voice message]')
        
        // Получаем файл голосового сообщения
        const file = await ctx.telegram.getFile(ctx.message.voice.file_id)
        if (!file.file_path) {
          throw new Error('File path not found')
        }

        // Формируем URL для скачивания файла
        const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`

        // Отправляем уведомление о начале обработки
        await ctx.reply(
          isRu
            ? '🎙️ Обрабатываю ваше голосовое сообщение...'
            : '🎙️ Processing your voice message...'
        )

        // Отправляем событие в Inngest для обработки
        await inngest.send({
          id: `voice-to-text-${ctx.from?.id}-${Date.now()}-${uuidv4().substring(0, 8)}`,
          name: 'voice-to-text.requested',
          data: {
            fileUrl,
            telegram_id: ctx.from?.id.toString(),
            is_ru: isRu,
            bot_name: ctx.botInfo?.username,
            username: ctx.from?.username,
          },
        })

        // Отправляем событие для обработки платежа
        await inngest.send({
          id: `payment-${ctx.from?.id}-${Date.now()}-${ModeEnum.VoiceToText}-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id: ctx.from?.id.toString(),
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
        console.log('⚠️ Неподдерживаемый тип сообщения [Unsupported message type]')
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, отправьте текстовое или голосовое сообщение'
            : '❌ Please send a text or voice message'
        )
        return
      }

      const telegram_id = ctx.from?.id.toString()
      console.log('👤 Telegram ID пользователя:', telegram_id)

      const userExists = await getUserByTelegramIdString(telegram_id || '')
      console.log('📊 Данные пользователя:', JSON.stringify(userExists, null, 2))

      if (!userExists?.id) {
        console.error('❌ Неверная структура данных пользователя:', {
          telegram_id,
          data_structure: Object.keys(userExists || {}),
        })
        const isRu = isRussian(ctx)
        return ctx.reply(
          isRu
            ? 'Произошла ошибка при обработке вашего профиля 😔'
            : 'An error occurred while processing your profile 😔'
        )
      }

      const level = userExists.level
      if (level === 4) {
        console.log('📈 Обновление уровня пользователя [Updating user level]')
        if (!telegram_id) {
          await ctx.reply(
            isRu
              ? 'Произошла ошибка при обработке вашего профиля 😔'
              : 'An error occurred while processing your profile 😔'
          )
          return ctx.scene.leave()
        }
        await updateUserLevelPlusOne(telegram_id, level)
        console.log('✅ Уровень пользователя обновлен [User level updated]')
      }

      return
    } catch (error) {
      console.error('❌ Ошибка в чате с аватаром:', error)
      const isRu = isRussian(ctx)
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
