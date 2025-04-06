import { Scenes, Markup } from 'telegraf'
import { MyContext, VideoModel } from '@/interfaces'
import {
  sendBalanceMessage,
  validateAndCalculateVideoModelPrice,
} from '@/price/helpers'
import { generateTextToVideo } from '@/services/generateTextToVideo'
import { isRussian } from '@/helpers/language'
import { sendGenericErrorMessage, videoModelKeyboard } from '@/menu'
import { getUserBalance } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { handleHelpCancel } from '@/handlers'

export const textToVideoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.TextToVideo,
  async ctx => {
    const isRu = isRussian(ctx)
    try {
      // Запрашиваем модель
      await ctx.reply(
        isRu ? 'Выберите модель для генерации:' : 'Choose generation model:',
        {
          reply_markup: videoModelKeyboard(isRu, 'text').reply_markup,
        }
      )
      ctx.wizard.next()
      return
    } catch (error: unknown) {
      console.error('Error in text_to_video:', error)
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
          ? 'text_to_video: Не удалось определить модель'
          : 'text_to_video: Could not identify model'
      )

    if (message && 'text' in message) {
      if (!ctx.from)
        throw new Error(
          isRu
            ? 'text_to_video: Не удалось определить пользователя'
            : 'text_to_video: Could not identify user'
        )
      const videoModel = message.text?.toLowerCase()
      console.log('videoModel', videoModel)

      const currentBalance = await getUserBalance(
        ctx.from.id.toString(),
        ctx.botInfo.username
      )
      console.log('currentBalance', currentBalance)
      if (currentBalance === null) {
        await ctx.reply(
          isRu ? 'Не удалось определить баланс' : 'Could not identify balance'
        )
        return ctx.scene.leave()
      }
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      } else {
        // Используем await для получения результата
        const result = await validateAndCalculateVideoModelPrice(
          videoModel,
          currentBalance,
          isRu,
          ctx,
          'text'
        )
        if (!result) {
          return ctx.scene.leave()
        }
        const { amount, modelId } = result
        console.log('amount', amount)
        console.log('modelId', modelId)
        if (amount === null) {
          return ctx.scene.leave()
        }

        // Устанавливаем videoModel в сессии
        ctx.session.videoModel = modelId as VideoModel

        await sendBalanceMessage(
          ctx.from.id.toString(),
          currentBalance,
          amount,
          isRu,
          ctx.telegram
        )

        await ctx.reply(
          isRu
            ? 'Пожалуйста, отправьте текстовое описание'
            : 'Please send a text description',
          Markup.removeKeyboard()
        )
        return ctx.wizard.next()
      }
    } else {
      console.log('text_to_video: else')
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
          ctx.from.id.toString(),
          ctx.from.username,
          isRu,
          ctx.botInfo?.username
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
