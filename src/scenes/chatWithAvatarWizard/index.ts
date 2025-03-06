import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussian } from '../../helpers/language'
import { handleTextMessage } from '../../handlers/handleTextMessage'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'

export const chatWithAvatarWizard = new Scenes.WizardScene<MyContext>(
  'chat_with_avatar',
  async ctx => {
    console.log('CASE: Чат с аватаром')
    const isRu = isRussian(ctx)

    await ctx.reply(
      isRu
        ? 'Напиши мне сообщение 💭 и я отвечу на него'
        : 'Write me a message 💭 and I will answer you',
      {
        reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
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
