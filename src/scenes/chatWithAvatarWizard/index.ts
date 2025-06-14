import { Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussian } from '../../helpers/language'
import { handleTextMessage } from '../../handlers/handleTextMessage'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'

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
        reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
      }
    )
    return ctx.wizard.next()
  },
  async ctx => {
    if ('text' in ctx.message) {
      // Передаем текстовое сообщение в обработчик
      await handleTextMessage(ctx, async () => {}) // Передаем пустую async функцию как next
    } else {
      // Обработка других типов сообщений, если нужно
      return ctx.scene.leave()
    }

    const isCancel = await handleHelpCancel(ctx)

    if (isCancel) {
      return ctx.scene.leave()
    }

    const telegram_id = ctx.from.id

    const userExists = await getUserByTelegramId(ctx)
    if (!userExists) {
      console.error(
        `[chatWithAvatarWizard] User with ID ${telegram_id} not found after message processing.`
      )
      return ctx.scene.leave()
    }
    const level = userExists.level
    if (level === 4) {
      await updateUserLevelPlusOne(telegram_id.toString(), level)
    }

    // Остаемся на текущем шаге для обработки следующих сообщений
    return ctx.wizard.selectStep(1) // Возвращаемся на второй шаг (индекс 1)
  }
)

export default chatWithAvatarWizard
