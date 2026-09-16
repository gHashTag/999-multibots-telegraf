import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { upscaleImage } from '@/services/imageUpscaler'
import { createHelpCancelKeyboard, handleHelpCancel } from '@/navigation'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { BalanceRefusedError } from '@/price/helpers/refuseUnpaidGeneration'

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
      // In-flight guard: the wizard stays parked on this step for the whole paid
      // upscale, so a second photo sent during generation would re-enter and charge
      // again. Reject-before-set (set synchronously, no await between), release in
      // finally. Mirrors the other paid wizards (#1090/#1113).
      if (ctx.session.imageUpscalerInProgress) {
        await ctx.reply(
          isRu
            ? '⏳ Уже обрабатываю ваше изображение, подождите завершения.'
            : '⏳ Already processing your image, please wait.'
        )
        return
      }
      ctx.session.imageUpscalerInProgress = true

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
        /*
         * AN EMPTY WALLET IS NOT AN OUTAGE, AND THIS CATCH USED TO CALL IT ONE.
         *
         * `upscaleImage` refuses through refuseUnpaidGeneration, which already
         * logged the short balance at info and already told the person, with a
         * top-up button under it (processBalanceOperation sends that message
         * itself). Re-logging it here at error was a SECOND notification for
         * the same non-event -- logger.error is the owner's Telegram push
         * (utils/logger.ts binds the transport at level 'error') -- and the
         * reply below then told the customer the system broke and to try
         * again later, which is false and points them away from paying.
         *
         * Only `insufficientFunds` is demoted. A provider outage, a Telegram
         * send failure, and a BalanceRefusedError with insufficientFunds:false
         * (bad price, failed balance write, exception) all keep the error and
         * the apology.
         */
        if (error instanceof BalanceRefusedError && error.insufficientFunds) {
          logger.warn('imageUpscalerWizard: refused, the balance is short', {
            telegramId: ctx.from?.id,
            reason: error.reason,
          })
          return ctx.scene.leave()
        }

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
      } finally {
        ctx.session.imageUpscalerInProgress = false
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

// Добавляем обработчики HELP и CANCEL как в других wizard'ах.
// Ссылка отложена в стрелку намеренно: @/navigation импортирует сцены, а сцены
// импортируют @/navigation — при некоторых порядках загрузки (например, когда
// тест импортирует сцену первой) экспорт ещё не заполнен, и telegraf падает с
// «Handler is undefined» прямо при вычислении модуля. Обёртка переносит взятие
// функции на момент вызова и делает регистрацию независимой от порядка.
imageUpscalerWizard.help(ctx => handleHelpCancel(ctx))
imageUpscalerWizard.command('cancel', ctx => handleHelpCancel(ctx))

export default imageUpscalerWizard
