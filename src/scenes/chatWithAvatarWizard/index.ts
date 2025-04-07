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
          ? 'Напиши мне сообщение 💭 и я отвечу на него'
          : 'Write me a message 💭 and I will answer you',
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
    
    if (!ctx.message || !('text' in ctx.message)) {
      console.log('⚠️ Получено не текстовое сообщение [Non-text message received]')
      return ctx.scene.leave()
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      console.log('🛑 Пользователь отменил чат [User cancelled chat]')
      return ctx.scene.leave()
    }

    const isRu = isRussian(ctx)

    const isHelp =
      ctx.message.text === (isRu ? levels[6].title_ru : levels[6].title_en)
    if (isHelp) {
      console.log('ℹ️ Пользователь запросил справку [User requested help]')
      ctx.session.mode = ModeEnum.SelectModelWizard
      await ctx.scene.enter('checkBalanceScene')
      return
    }

    try {
      // Обработка текстового сообщения
      console.log('🤖 Обработка сообщения пользователя [Processing user message]')
      await handleTextMessage(ctx)

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
