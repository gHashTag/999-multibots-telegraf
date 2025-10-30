/**
 * Multi-Photo Action Handlers - Handle callback queries for multi-photo operations
 */
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Registers multi-photo callback action handlers with the bot
 */
export function registerMultiPhotoActions(bot: any): void {
  // Handle multi-photo neurophoto confirmation with dynamic user ID and count
  bot.action(/multi_neurophoto_([0-9]+)_([0-9]+)/, async (ctx: MyContext) => {
    try {
      await ctx.answerCbQuery()
      const match = ctx.match as RegExpExecArray
      const [, userId, photoCount] = match
      const isRu = isRussianFromState(ctx)

      logger.info('🎯 Multi-photo: Processing confirmation', {
        userId,
        photoCount,
        sessionMultiPhotoCount: ctx.session?.multiPhotoCount,
        sessionMultiPhotoUrls: ctx.session?.multiPhotoUrls?.length
      })

      if (!ctx.session?.multiPhotoUrls || !ctx.session?.multiPhotoCount) {
        await ctx.reply(
          isRu
            ? '❌ Данные о фотографиях не найдены. Попробуйте снова.'
            : '❌ Photo data not found. Please try again.'
        )
        return
      }

      // Validate data consistency
      if (ctx.session.multiPhotoCount !== parseInt(photoCount)) {
        logger.warn('Multi-photo count mismatch', {
          sessionCount: ctx.session.multiPhotoCount,
          callbackCount: photoCount
        })
      }

      // Clear confirmation state and start processing
      ctx.session.awaitingMultiPhotoConfirmation = false

      // Update message to show processing
      await ctx.editMessageText(
        isRu
          ? `🎨 Начинаю обработку ${photoCount} изображений...\n⏱️ Это может занять несколько минут`
          : `🎨 Starting processing of ${photoCount} images...\n⏱️ This may take several minutes`
      )

      // Enter neurophoto scene for processing
      await ctx.scene.enter('neuro_photo_v2')

    } catch (error) {
      logger.error('Error in multi_neurophoto confirmation:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
      })

      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при подтверждении. Попробуйте снова.'
          : '❌ Confirmation error occurred. Please try again.'
      )
    }
  })

  // Handle multi-photo neurophoto cancellation
  bot.action('multi_neurophoto_cancel', async (ctx: MyContext) => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      logger.info('🚫 Multi-photo: Processing cancellation', {
        telegramId: ctx.from?.id,
        multiPhotoCount: ctx.session?.multiPhotoCount
      })

      // Clear multi-photo session data
      if (ctx.session) {
        ctx.session.multiPhotoUrls = undefined
        ctx.session.multiPhotoCount = undefined
        ctx.session.awaitingMultiPhotoConfirmation = false
        ctx.session.multiPhotoProcessingIndex = undefined
      }

      await ctx.editMessageText(
        isRu
          ? '❌ Обработка серии фотографий отменена.'
          : '❌ Photo series processing cancelled.'
      )

    } catch (error) {
      logger.error('Error in multi_neurophoto cancellation:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
      })
    }
  })

  // Handle new multi-photo series action
  bot.action('new_multi_neurophoto', async (ctx: MyContext) => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      logger.info('🆕 Multi-photo: Starting new series', {
        telegramId: ctx.from?.id
      })

      // Clear any existing multi-photo data
      if (ctx.session) {
        ctx.session.multiPhotoUrls = undefined
        ctx.session.multiPhotoCount = undefined
        ctx.session.awaitingMultiPhotoConfirmation = false
        ctx.session.multiPhotoProcessingIndex = undefined
      }

      await ctx.scene.leave()
      await ctx.scene.enter('neuro_photo_v2')

      await ctx.reply(
        isRu
          ? '🆕 Начинаем создание новой серии нейрофото! Отправьте несколько фотографий (альбом).'
          : '🆕 Starting new neurophoto series! Send multiple photos (album).'
      )

    } catch (error) {
      logger.error('Error in new_multi_neurophoto action:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
      })
    }
  })

  // Handle multi-photo navigation (for results with multiple images)
  bot.action(/multi_neurophoto_nav_([0-9]+)/, async (ctx: MyContext) => {
    try {
      await ctx.answerCbQuery()
      const match = ctx.match as RegExpExecArray
      const [, imageIndex] = match
      const isRu = isRussianFromState(ctx)

      logger.info('📸 Multi-photo: Navigation requested', {
        telegramId: ctx.from?.id,
        imageIndex
      })

      // This would be handled by the result display system
      // For now, just acknowledge
      await ctx.answerCbQuery(
        isRu
          ? `Изображение ${parseInt(imageIndex) + 1}`
          : `Image ${parseInt(imageIndex) + 1}`,
        { show_alert: false }
      )

    } catch (error) {
      logger.error('Error in multi_neurophoto navigation:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
      })
    }
  })

  // Handle multi-photo info display
  bot.action('multi_neurophoto_info', async (ctx: MyContext) => {
    try {
      await ctx.answerCbQuery()
      const isRu = isRussianFromState(ctx)

      logger.info('ℹ️ Multi-photo: Info requested', {
        telegramId: ctx.from?.id
      })

      await ctx.answerCbQuery(
        isRu
          ? 'Навигация по серии нейрофото'
          : 'Neurophoto series navigation',
        { show_alert: true }
      )

    } catch (error) {
      logger.error('Error in multi_neurophoto info:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        telegramId: ctx.from?.id,
      })
    }
  })

  logger.info('✅ Multi-photo action handlers registered successfully')
}