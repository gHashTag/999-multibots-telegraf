import { Scenes } from 'telegraf'
import { MyContext, VideoModel } from '@/interfaces'
import {
  sendBalanceMessage,
  validateAndCalculateVideoModelPrice,
} from '@/price/helpers'
import { generateTextToVideo } from '@/services/generateTextToVideo'
import { isRussian } from '@/helpers/language'
import { sendGenericErrorMessage, videoModelKeyboard } from '@/menu'
import { getUserBalance } from '@/core/supabase'
import { VIDEO_MODELS } from '@/interfaces'
import { handleHelpCancel } from '@/handlers'

export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  'textToVideoWizard',
  async ctx => {
    const isRu = isRussian(ctx)
    try {
      if (!ctx.from) {
        throw new Error(
          isRu
            ? 'Не удалось определить пользователя'
            : 'Could not identify user'
        )
      }

      if (!ctx.from.username) {
        throw new Error(
          isRu
            ? 'Не удалось определить username'
            : 'Could not identify username'
        )
      }

      // Запрашиваем модель
      await ctx.reply(
        isRu ? 'Выберите модель для генерации:' : 'Choose generation model:',
        {
          reply_markup: videoModelKeyboard(isRu).reply_markup,
        }
      )

      return ctx.wizard.next()
    } catch (error: unknown) {
      console.error('Error in textToVideoWizard:', error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      await ctx.reply(
        isRu
          ? `❌ Произошла ошибка: ${errorMessage}`
          : `❌ An error occurred: ${errorMessage}`
      )
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message as { text?: string }
    if (!message.text)
      throw new Error(
        isRu
          ? 'textToVideoWizard: Не удалось определить модель'
          : 'textToVideoWizard: Could not identify model'
      )

    if (message && 'text' in message) {
      if (!ctx.from)
        throw new Error(
          isRu
            ? 'textToVideoWizard: Не удалось определить пользователя'
            : 'textToVideoWizard: Could not identify user'
        )
      const videoModel = message.text?.toLowerCase()
      const availableModels = VIDEO_MODELS.map(model => model.name)
      const currentBalance = await getUserBalance(ctx.from.id)

      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      } else {
        // Используем await для получения результата
        const price = await validateAndCalculateVideoModelPrice(
          videoModel,
          availableModels,
          currentBalance,
          isRu,
          ctx
        )
        if (price === null) {
          return ctx.scene.leave()
        }

        // Устанавливаем videoModel в сессии
        ctx.session.videoModel = videoModel as VideoModel

        await sendBalanceMessage(ctx.from.id, currentBalance, price, isRu)

        await ctx.reply(
          isRu
            ? 'Пожалуйста, отправьте текстовое описание'
            : 'Please send a text description'
        )
        return ctx.wizard.next()
      }
    } else {
      console.log('textToVideoWizard: else')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (message && 'text' in message) {
      const prompt = message.text

      console.log('prompt', prompt)

      if (!prompt)
        throw new Error(
          isRu ? 'Не удалось определить текст' : 'Could not identify text'
        )

      const videoModel = ctx.session.videoModel
      console.log('videoModel', videoModel)
      if (prompt && videoModel && ctx.from && ctx.from.username) {
        await generateTextToVideo(
          prompt,
          videoModel,
          ctx.from.id,
          ctx.from.username,
          isRu
        )

        ctx.session.prompt = prompt
      }

      await ctx.scene.leave()
    } else {
      await sendGenericErrorMessage(ctx, isRu)
      await ctx.scene.leave()
    }
  }
)

export default textToVideoWizard
