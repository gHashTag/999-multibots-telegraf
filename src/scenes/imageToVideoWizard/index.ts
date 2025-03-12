import { Scenes, Markup } from 'telegraf'
import { sendBalanceMessage } from '@/price/helpers'
import { generateImageToVideo } from '@/services/generateImageToVideo'
import { MyContext, VideoModel } from '@/interfaces'
import {
  cancelMenu,
  createHelpCancelKeyboard,
  sendGenerationCancelledMessage,
  sendGenericErrorMessage,
  videoModelKeyboard,
} from '@/menu'
import { isRussian } from '@/helpers/language'
import { getUserBalance } from '@/core/supabase'

import { getBotToken, handleHelpCancel } from '@/handlers'
import { validateAndCalculateVideoModelPrice } from '@/price/helpers/validateAndCalculateVideoModelPrice'

export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  'image_to_video',
  async ctx => {
    const isRu = isRussian(ctx)
    // Запрашиваем модель
    await ctx.reply(
      isRu ? 'Выберите модель для генерации:' : 'Choose generation model:',
      {
        reply_markup: videoModelKeyboard(isRu, 'image').reply_markup,
      }
    )
    ctx.wizard.next()
    return
  },
  async ctx => {
    const isRu = isRussian(ctx)

    if (!ctx.from) {
      await ctx.reply(isRu ? 'Пользователь не найден' : 'User not found')
      return ctx.scene.leave()
    }

    const message = ctx.message as { text?: string }

    if (message && 'text' in message) {
      const messageText = message.text?.toLowerCase()
      console.log('messageText', messageText)

      if (messageText === (isRu ? 'отмена' : 'cancel')) {
        await sendGenerationCancelledMessage(ctx, isRu)
        return ctx.scene.leave()
      }
      const currentBalance = await getUserBalance(ctx.from.id)
      console.log('currentBalance', currentBalance)
      const videoModel = messageText
      console.log('videoModel', videoModel)

      const { paymentAmount, modelId } =
        await validateAndCalculateVideoModelPrice(
          videoModel,
          currentBalance,
          isRu,
          ctx,
          'image'
        )
      ctx.session.paymentAmount = paymentAmount

      // Устанавливаем videoModel в сессии
      ctx.session.videoModel = modelId as VideoModel
      console.log('ctx.session.videoModel', ctx.session.videoModel)

      await sendBalanceMessage(ctx, currentBalance, paymentAmount, isRu)

      await ctx.reply(
        isRu
          ? `Вы выбрали модель для генерации: ${videoModel}`
          : `You have chosen the generation model: ${videoModel}`,
        {
          reply_markup: { remove_keyboard: true },
        }
      )
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      }

      await ctx.reply(
        isRu
          ? 'Пожалуйста, отправьте изображение для генерации видео'
          : 'Please send an image for video generation',
        {
          reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
        }
      )
      return ctx.wizard.next()
    } else {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const message = ctx.message
    const isRu = ctx.from?.language_code === 'ru'
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    } else {
      if (message && 'photo' in message) {
        const photo = message.photo[message.photo.length - 1]
        const file = await ctx.telegram.getFile(photo.file_id)
        const filePath = file.file_path

        if (!filePath) {
          await ctx.reply(
            isRu ? 'Не удалось получить изображение' : 'Failed to get image'
          )
          return ctx.scene.leave()
        }

        const botToken = getBotToken(ctx)
        ctx.session.imageUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`
        await ctx.reply(
          isRu
            ? 'Теперь опишите желаемое движение в видео'
            : 'Now describe the desired movement in the video',
          {
            reply_markup: cancelMenu(isRu).reply_markup,
          }
        )
        return ctx.wizard.next()
      }

      await ctx.reply(
        isRu ? 'Пожалуйста, отправьте изображение' : 'Please send an image'
      )
      return undefined
    }
  },
  async ctx => {
    const message = ctx.message
    const isRu = isRussian(ctx)
    console.log('isRu', isRu)
    if (message && 'text' in message) {
      const isCancel = await handleHelpCancel(ctx)
      if (isCancel) {
        return ctx.scene.leave()
      } else {
        const prompt = message.text
        const videoModel = ctx.session.videoModel as VideoModel
        const imageUrl = ctx.session.imageUrl
        if (!prompt) throw new Error('Prompt is required')
        if (!videoModel) throw new Error('Video model is required')
        if (!imageUrl) throw new Error('Image URL is required')
        if (!ctx.from?.username) throw new Error('Username is required')

        try {
          console.log('Calling generateImageToVideo with:', {
            imageUrl,
            prompt,
            videoModel,
            telegram_id: ctx.from.id,
            username: ctx.from.username,
            isRu,
          })

          await generateImageToVideo({
            imageUrl,
            prompt,
            videoModel,
            telegram_id: ctx.from.id.toString(),
            username: ctx.from.username,
            isRu,
            botName: ctx.botInfo?.username,
          })
          ctx.session.prompt = prompt
          ctx.session.mode = 'image_to_video'
        } catch (error) {
          console.error('Ошибка при создании видео:', error)
          await ctx.reply(
            isRu
              ? 'Произошла ошибка при создании видео. Пожалуйста, попробуйте позже.'
              : 'An error occurred while creating the video. Please try again later.'
          )
        }
        return ctx.scene.leave()
      }
    }

    await ctx.reply(
      isRu
        ? 'Пожалуйста, отправьте текстовое описание'
        : 'Please send a text description',
      Markup.removeKeyboard()
    )
    return undefined
  }
)

export default imageToVideoWizard
