import { Scenes, Markup } from 'telegraf'
import { sendBalanceMessage } from '@/price/helpers'
import { generateImageToVideo } from '@/services/generateImageToVideo'
import { MyContext, VideoModel } from '@/interfaces'
import { cancelMenu } from '@/menu'
import { isRussian } from '@/helpers/language'
import { getUserBalance } from '@/core/supabase'

import { getBotToken, handleHelpCancel } from '@/handlers'
import { validateAndCalculateVideoModelPrice } from '@/price/helpers'
import { ModeEnum } from '@/interfaces/modes.interface'
import { logger } from '@/utils/logger'

export const imageToVideoWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToVideo,
  async ctx => {
    try {
      const isRu = ctx.from?.language_code === 'ru' || false

      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите модель для генерации видео'
          : 'Please select a model for video generation'
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Ошибка при инициализации сцены:', {
        description: 'Error initializing scene',
        error: error instanceof Error ? error.message : String(error),
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.leave()
    }
  },
  async ctx => {
    try {
      if (!ctx.message || !('text' in ctx.message)) {
        const isRu = ctx.from?.language_code === 'ru' || false
        await ctx.reply(
          isRu
            ? 'Пожалуйста, отправьте текстовое сообщение'
            : 'Please send a text message'
        )
        return ctx.scene.leave()
      }

      const messageText = ctx.message.text
      const isRu = ctx.from?.language_code === 'ru' || false

      const currentBalance = await getUserBalance(
        ctx.from?.id?.toString() || '',
        ctx.botInfo.username
      )
      if (currentBalance === null) {
        return ctx.scene.leave()
      }

      const result = await validateAndCalculateVideoModelPrice(
        messageText,
        currentBalance,
        isRu,
        ctx,
        'image'
      )

      if (!result) {
        return ctx.scene.leave()
      }

      const { amount, modelId } = result
      ctx.session.amount = amount
      ctx.session.videoModel = modelId

      await sendBalanceMessage(
        ctx.from?.id?.toString() || '',
        currentBalance,
        amount,
        isRu,
        ctx.telegram
      )

      await ctx.reply(
        isRu
          ? `Вы выбрали модель для генерации: ${messageText}`
          : `You have chosen the generation model: ${messageText}`,
        {
          reply_markup: { remove_keyboard: true },
        }
      )

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Ошибка в обработчике сообщения:', {
        description: 'Error in message handler',
        error: error instanceof Error ? error.message : String(error),
        telegram_id: ctx.from?.id,
      })

      const isRu = ctx.from?.language_code === 'ru' || false
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке вашего запроса'
          : '❌ An error occurred while processing your request'
      )
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
          ctx.session.mode = ModeEnum.ImageToVideo
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
