import { Scenes, Markup } from 'telegraf'
import type { MyContext } from '../../interfaces'
import { isRussian } from '../../helpers/language'
import { handleTextMessage } from '../../handlers/handleTextMessage'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'

export const chatWithAvatarWizard = new Scenes.WizardScene<MyContext>(
  'chat_with_avatar',
  async ctx => {
    console.log('CASE: Чат с аватаром')
    const isRu = isRussian(ctx)

    await ctx.reply(
      isRu
        ? 'Напиши мне сообщение 💭 и я отвечу на него'
        : 'Write me a message 💭 and I will answer you'
    )
    return ctx.wizard.next()
  },
  async ctx => {
    if (!ctx.message || !('text' in ctx.message)) {
      return ctx.scene.leave()
    }

    // Обработка текстового сообщения
    await handleTextMessage(ctx)

    const telegram_id = ctx.from.id

    const userExists = await getUserByTelegramId(ctx)
    if (!userExists.data) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.data.level
    if (level === 4) {
      await updateUserLevelPlusOne(telegram_id.toString(), level)
    }

    return
  }
)

export default chatWithAvatarWizard
