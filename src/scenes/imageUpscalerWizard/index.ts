import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { upscaleImage } from '@/services/imageUpscaler'
import { createHelpCancelKeyboard } from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export const imageUpscalerWizard = new Scenes.WizardScene<MyContext>(
  ModeEnum.ImageUpscaler,
  async ctx => {
    console.log('CASE 0: image_upscaler')
    const isRu = isRussianFromState(ctx)
    console.log('CASE: imageUpscalerCommand')

    // Устанавливаем режим для правильной работы справки
    ctx.session.mode = ModeEnum.ImageUpscaler

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    await ctx.reply(
      isRu
        ? '⬆️ Отправьте фото для увеличения качества\n\n🎯 Clarity Upscaler увеличит разрешение в 2 раза и улучшит детализацию\n💎 Стоимость: 3 ⭐'
        : '⬆️ Send a photo to upscale quality\n\n🎯 Clarity Upscaler will increase resolution 2x and improve details\n💎 Cost: 3 ⭐',
      {
        reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
      }
    )
    ctx.scene.session.state = { step: 0 }
    return ctx.wizard.next()
  },
  async ctx => {
    console.log('CASE 1: image_upscaler')
    const isRu = isRussianFromState(ctx)

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    if (!ctx.message) {
      await ctx.reply(
        isRu ? 'Пожалуйста, отправьте изображение' : 'Please send an image',
        {
          reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
        }
      )
      return
    }

    if ('photo' in ctx.message) {
      // Если отправлено фото, обрабатываем его
      const photo = ctx.message.photo
      const fileId = photo[photo.length - 1].file_id
      const file = await ctx.telegram.getFileLink(fileId)
      const imageUrl = file.href

      logger.info('Image upscaler started', {
        telegramId: ctx.from?.id,
        imageUrl,
      })

      try {
        // Вызываем отдельный сервис upscaler'а (не связанный с FLUX Kontext)
        await upscaleImage({
          imageUrl,
          telegram_id: String(ctx.from?.id),
          username: ctx.from?.username || 'unknown_user',
          is_ru: isRu,
          ctx,
          originalPrompt: 'Manual upscale request',
        })

        return ctx.scene.leave()
      } catch (error) {
        logger.error('Error in imageUpscalerWizard:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          telegramId: ctx.from?.id,
        })

        await ctx.reply(
          isRu
            ? 'Произошла ошибка при увеличении качества изображения. Пожалуйста, попробуйте позже.'
            : 'An error occurred while upscaling the image. Please try again later.'
        )
        return ctx.scene.leave()
      }
    } else {
      // Если отправлено не фото, просим отправить фото
      await ctx.reply(
        isRu ? 'Пожалуйста, отправьте изображение' : 'Please send an image',
        {
          reply_markup: createHelpCancelKeyboard(isRu).reply_markup,
        }
      )
      return
    }
  }
)

// Добавляем обработчики HELP и CANCEL как в других wizard'ах
imageUpscalerWizard.help(handleHelpCancel)
imageUpscalerWizard.command('cancel', handleHelpCancel)

export default imageUpscalerWizard
