import { TelegramId } from '@/interfaces/telegram.interface';
import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussian } from '../../helpers/language'
import { handleTextMessage } from '../../handlers/handleTextMessage'
import { handleHelpCancel } from '@/handlers'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
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
    console.log('CASE: Чат с аватаром')
    const isRu = isRussian(ctx)

    await ctx.reply(
      isRu
        ? 'Напиши мне сообщение 💭 и я отвечу на него'
        : 'Write me a message 💭 and I will answer you',
      {
        reply_markup: createHelpCancelKeyboard(isRu),
      }
    )
    return ctx.wizard.next()
  },
  async ctx => {
    if (!ctx.message || !('text' in ctx.message)) {
      return ctx.scene.leave()
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const isRu = isRussian(ctx)

    const isHelp =
      ctx.message.text === (isRu ? levels[6].title_ru : levels[6].title_en)
    if (isHelp) {
      ctx.session.mode = ModeEnum.SelectModelWizard
      await ctx.scene.enter('checkBalanceScene')
      return
    }

    // Обработка текстового сообщения
    await handleTextMessage(ctx)

    const telegram_id = ctx.from.id
    console.log(telegram_id, 'telegram_id')

    const userExists = await getUserByTelegramId(ctx)
    console.log(
      '🟢 User data:',
      JSON.stringify(userExists, null, 2),
      'userExists'
    )

    if (!userExists?.id) {
      console.error('🔴 Invalid user data structure:', {
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
      await updateUserLevelPlusOne(telegram_id.toString(), level)
    }

    return
  }
)

export default chatWithAvatarWizard
