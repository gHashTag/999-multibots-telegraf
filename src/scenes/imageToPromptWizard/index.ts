import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'

import { createHelpCancelKeyboard } from '@/menu'
import { generateImageToPrompt } from '@/price/helpers/imageToPrompt'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { getBotToken } from '@/handlers'
import { handleMenu } from '@/handlers/handleMenu'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes.interface'

if (!process.env.HUGGINGFACE_TOKEN) {
  throw new Error('HUGGINGFACE_TOKEN is not set')
}

export const imageToPromptWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageToPrompt,
  async ctx => {
    logger.info('🎯 Запуск сцены image_to_prompt', {
      description: 'Starting image_to_prompt scene',
      telegram_id: ctx.from?.id,
      bot_name: ctx.botInfo?.username,
    })

    const isRu = ctx.from?.language_code === 'ru'

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    await ctx.reply(
      isRu
        ? 'Пожалуйста, отправьте изображение для генерации промпта'
        : 'Please send an image to generate a prompt',
      {
        reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
      }
    )
    ctx.wizard.next()
    return
  },
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'
    const telegram_id = ctx.from?.id.toString()
    const botName = ctx.botInfo?.username

    logger.info('📸 Ожидание фото', {
      description: 'Waiting for photo',
      telegram_id,
      bot_name: botName,
    })

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const imageMsg = ctx.message
    if (!imageMsg || !('photo' in imageMsg) || !imageMsg.photo) {
      logger.error('❌ Фото не найдено в сообщении', {
        description: 'No photo in message',
        telegram_id,
        bot_name: botName,
      })
      await ctx.reply(
        isRu ? 'Пожалуйста, отправьте изображение' : 'Please send an image'
      )
      return ctx.scene.leave()
    }

    if (!telegram_id || !botName) {
      logger.error('❌ Отсутствуют необходимые данные', {
        description: 'Missing required data',
        telegram_id,
        bot_name: botName,
      })
      await ctx.reply(
        isRu
          ? 'Произошла ошибка. Пожалуйста, попробуйте позже.'
          : 'An error occurred. Please try again later.'
      )
      return ctx.scene.leave()
    }

    try {
      const photoSize = imageMsg.photo[imageMsg.photo.length - 1]
      const file = await ctx.telegram.getFile(photoSize.file_id)
      ctx.session.mode = ModeEnum.ImageToPrompt
      const botToken = getBotToken(ctx)
      const imageUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`

      await generateImageToPrompt(imageUrl, telegram_id, ctx, isRu, botName)
      ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Ошибка при обработке изображения', {
        description: 'Error processing image',
        telegram_id,
        bot_name: botName,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      await ctx.reply(
        isRu
          ? 'Произошла ошибка при обработке изображения. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
          : 'An error occurred while processing the image. Please try again later or contact support.'
      )
      return ctx.scene.leave()
    }
    return
  },
  async ctx => {
    await handleMenu(ctx)
    ctx.scene.leave()
    return
  }
)

export default imageToPromptWizard
