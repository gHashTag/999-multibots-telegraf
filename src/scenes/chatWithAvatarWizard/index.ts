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
    const isCancel = await handleHelpCancel(ctx)

    if (isCancel) {
      return ctx.scene.leave()
    }

    if ('text' in ctx.message) {
      // ✅ ИСПРАВЛЕНО: Обрабатываем текст для чата с аватаром напрямую
      try {
        const telegramId = ctx.from?.id?.toString()
        if (!telegramId) {
          return ctx.scene.leave()
        }

        const { answerAi } = await import('../../core/openai/requests')
        const { getUserData, getUserModel } = await import(
          '../../core/supabase'
        )
        const { getUserLanguageFromState } = await import(
          '@/helpers/centralizedLanguage'
        )

        const userData = await getUserData(telegramId)
        const userModel = await getUserModel(telegramId)
        const languageCode = getUserLanguageFromState(ctx)

        const prompt = ctx.message.text
        const model = userModel || 'deepseek-chat'

        const response = await answerAi(model, userData, prompt, languageCode)
        await ctx.reply(response)

        // Остаемся на том же шаге для продолжения чата
        return ctx.wizard.selectStep(1)
      } catch (error) {
        console.error('[chatWithAvatarWizard] Error processing text:', error)
        const isRu = isRussian(ctx)
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка при обработке сообщения.'
            : '❌ An error occurred while processing the message.'
        )
        return ctx.scene.leave()
      }
    } else {
      // Обработка других типов сообщений, если нужно
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
