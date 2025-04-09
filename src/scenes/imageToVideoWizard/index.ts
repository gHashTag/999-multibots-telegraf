import { Scenes, Markup } from 'telegraf'
import { MyContext, VideoModel } from '@/types'
import {
  sendBalanceMessage,
  validateAndCalculateVideoModelPrice,
} from '@/price/helpers'
import { isRussian } from '@/helpers/language'
import { sendGenericErrorMessage, videoModelKeyboard } from '@/menu'
import { getUserBalance } from '@/core/supabase'
import { ModeEnum } from '@/types/modes'
import { handleHelpCancel } from '@/handlers'
import { inngest } from '@/inngest-functions/clients'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'

export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToVideo,
  async ctx => {
    const isRu = isRussian(ctx)
    try {
      // Запрашиваем модель
      await ctx.reply(
        isRu
          ? '🎥 Выберите модель для генерации видео:'
          : '🎥 Choose video generation model:',
        {
          reply_markup: videoModelKeyboard(isRu, 'image').reply_markup,
        }
      )
      ctx.wizard.next()
      return
    } catch (error: unknown) {
      console.error('❌ Error in image_to_video:', error)
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
          ? 'image_to_video: Не удалось определить модель'
          : 'image_to_video: Could not identify model'
      )

    if (message && 'text' in message) {
      if (!ctx.from)
        throw new Error(
          isRu
            ? 'image_to_video: Не удалось определить пользователя'
            : 'image_to_video: Could not identify user'
        )
      const videoModel = message.text?.toLowerCase()
      console.log('🎬 Selected video model:', videoModel)

      const currentBalance = await getUserBalance(
        ctx.from.id.toString(),
        ctx.botInfo.username
      )
      console.log('💰 Current balance:', currentBalance)
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
          'image'
        )
        if (!result) {
          return ctx.scene.leave()
        }
        const { amount, modelId } = result
        console.log('💵 Generation cost:', amount)
        console.log('🆔 Model ID:', modelId)
        if (amount === null) {
          return ctx.scene.leave()
        }

        // Устанавливаем videoModel в сессии
        ctx.session.videoModel = modelId as VideoModel

        // Показываем информацию о балансе и стоимости
        await sendBalanceMessage(
          ctx.from.id.toString(),
          currentBalance,
          amount,
          isRu,
          ctx.telegram
        )

        await ctx.reply(
          isRu
            ? '🖼️ Пожалуйста, отправьте изображение для генерации видео'
            : '🖼️ Please send an image for video generation',
          Markup.removeKeyboard()
        )
        ctx.session.amount = amount
        return ctx.wizard.next()
      }
    } else {
      console.log('❌ image_to_video: else branch - invalid message')
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    // Проверяем, что получили изображение
    if (!message || !('photo' in message)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте изображение для генерации видео'
          : '❌ Please send an image for video generation'
      )
      return
    }

    // Сохраняем ссылку на изображение
    const photos = message.photo
    if (!photos || photos.length === 0) {
      await ctx.reply(
        isRu
          ? '❌ Не удалось получить изображение'
          : '❌ Failed to get the image'
      )
      return
    }

    // Получаем file_id последнего (самого большого) изображения
    const fileId = photos[photos.length - 1].file_id
    const file = await ctx.telegram.getFile(fileId)
    const imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`

    ctx.session.imageUrl = imageUrl

    await ctx.reply(
      isRu
        ? '✍️ Теперь отправьте текстовое описание для генерации видео'
        : '✍️ Now send a text description for video generation'
    )
    return ctx.wizard.next()
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (message && 'text' in message) {
      const prompt = message.text
      console.log('📝 Prompt:', prompt)

      if (!prompt)
        throw new Error(
          isRu ? 'Не удалось определить текст' : 'Could not identify text'
        )

      const videoModel = ctx.session.videoModel
      const imageUrl = ctx.session.imageUrl
      console.log('🎥 Using video model:', videoModel)
      console.log('🖼️ Using image URL:', imageUrl)

      if (prompt && videoModel && imageUrl && ctx.from && ctx.from.username) {
        // Получаем ключ для изображения из конфигурации модели
        const modelConfig = VIDEO_MODELS_CONFIG[videoModel]
        const imageKey = modelConfig?.imageKey || 'image'

        // Отправляем событие для генерации видео через Inngest
        await inngest.send({
          name: 'text-to-video.requested',
          data: {
            prompt,
            telegram_id: ctx.from.id.toString(),
            is_ru: isRu,
            bot_name: ctx.botInfo?.username || '',
            model_id: videoModel,
            username: ctx.from.username,
            [imageKey]: imageUrl,
          },
        })

        console.log('⚡️ Sent text-to-video.requested event:', {
          description: 'Image to video generation requested',
          prompt,
          model: videoModel,
          telegram_id: ctx.from.id,
          [imageKey]: imageUrl,
        })

        await ctx.reply(
          isRu
            ? '🎬 Запрос на генерацию видео отправлен! Я пришлю результат, как только он будет готов.'
            : '🎬 Video generation request sent! I will send you the result as soon as it is ready.'
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

export default imageToVideoWizard
