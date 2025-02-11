import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussian } from '../../helpers/language'
import { handleTextMessage } from '../../handlers/handleTextMessage'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'

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

    // Остаемся в сцене для дальнейшего общения
    return
  }
)

export default chatWithAvatarWizard
