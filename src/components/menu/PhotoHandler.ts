/**
 * Photo Handler - Manages photo-related operations and inline actions
 */
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { BaseHandler, PhotoHandlerConfig } from '../shared/types'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { message } from 'telegraf/filters'
import { detectMultiPhotoUpload } from '@/handlers/multiPhotoHandler'

export class PhotoHandler implements BaseHandler {
  private photoHandlers: PhotoHandlerConfig[] = []
  private actionHandlers: Map<string, (ctx: MyContext) => Promise<void>> = new Map()

  constructor() {
    this.initializePhotoHandlers()
    this.initializeActionHandlers()
  }

  async handle(ctx: MyContext): Promise<void> {
    // Handle photo messages
    if (ctx.message && 'photo' in ctx.message) {
      await this.handlePhoto(ctx)
      return
    }

    // Handle other photo-related contexts
    logger.debug('PhotoHandler: No photo message to process', {
      telegramId: ctx.from?.id,
      updateType: ctx.updateType
    })
  }

  private async handlePhoto(ctx: MyContext): Promise<void> {
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    logger.info('🎯 PhotoHandler: Photo received', {
      telegramId,
      currentScene: ctx.scene?.current?.id,
      sessionExists: !!ctx.session,
      awaitingFluxKontextImage: ctx.session?.awaitingFluxKontextImage,
      awaitingFluxKontextImageA: ctx.session?.awaitingFluxKontextImageA,
      awaitingFluxKontextImageB: ctx.session?.awaitingFluxKontextImageB,
    })

    // Process handlers in priority order
    const sortedHandlers = this.photoHandlers.sort((a, b) => b.priority - a.priority)

    for (const config of sortedHandlers) {
      if (config.condition(ctx)) {
        logger.info('PhotoHandler: Handler matched', {
          telegramId,
          handlerPriority: config.priority
        })

        try {
          await config.handler(ctx)
          return // Stop processing after first match
        } catch (error) {
          logger.error('PhotoHandler: Handler failed', {
            error,
            telegramId,
            handlerPriority: config.priority
          })
          // Continue to next handler on error
        }
      }
    }

    logger.info('PhotoHandler: No handler matched for photo', {
      telegramId,
      availableHandlers: this.photoHandlers.length
    })
  }

  private initializePhotoHandlers(): void {
    // Multi-photo neurophoto handler (highest priority)
    this.photoHandlers.push({
      condition: (ctx) => {
        // Check if this might be a multi-photo upload
        return ctx.scene?.current?.id === 'neuro_photo_v2' ||
               ctx.session?.awaitingMultiPhotoConfirmation ||
               ('media_group_id' in ctx.message && !!ctx.message.media_group_id)
      },
      handler: async (ctx) => {
        logger.info('PhotoHandler: Processing potential multi-photo upload')
        const isMultiPhoto = await detectMultiPhotoUpload(ctx)

        if (!isMultiPhoto) {
          // Not a multi-photo, let other handlers process
          return Promise.resolve()
        }

        logger.info('PhotoHandler: Multi-photo detected, processing...')
      },
      priority: 200
    })

    // FLUX Kontext image handler
    this.photoHandlers.push({
      condition: (ctx) => !!ctx.session?.awaitingFluxKontextImage,
      handler: async (ctx) => {
        logger.info('PhotoHandler: Processing FLUX Kontext image')
        const { handleFluxKontextImage } = await import('@/commands/fluxKontextCommand')
        await handleFluxKontextImage(ctx)
      },
      priority: 100
    })

    // Add more photo handlers here as needed
    // Example: Avatar photo handler, general image processing, etc.
  }

  private initializeActionHandlers(): void {
    // Upscale image action
    this.actionHandlers.set('upscale_image', async (ctx) => {
      logger.info('PhotoHandler: upscale_image action', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()

        const telegram_id = ctx.from?.id?.toString()
        const username = ctx.from?.username || ''
        const is_ru = isRussianFromState(ctx)

        if (!telegram_id) {
          await ctx.reply(
            is_ru ? '❌ Ошибка получения ID пользователя.' : '❌ User ID error.'
          )
          return
        }

        // Check if there's a saved image for upscaling
        if (!ctx.session?.lastGeneratedImageUrl) {
          await ctx.reply(
            is_ru
              ? '❌ Нет изображения для увеличения качества. Сначала сгенерируйте изображение с помощью FLUX Kontext.'
              : '❌ No image to upscale. Please generate an image with FLUX Kontext first.'
          )
          return
        }

        const { upscaleFluxKontextImage } = await import('@/services/generateFluxKontext')
        await upscaleFluxKontextImage({
          imageUrl: ctx.session.lastGeneratedImageUrl,
          telegram_id,
          username,
          is_ru,
          ctx,
          originalPrompt: ctx.session.lastGeneratedPrompt,
        })
      } catch (error) {
        logger.error('Error in upscale_image action:', {
          error,
          telegramId: ctx.from?.id,
        })

        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при увеличении качества изображения.'
            : '❌ An error occurred while upscaling the image.'
        )
      }
    })

    // Upscale neurophoto image action
    this.actionHandlers.set('upscale_neurophoto_image', async (ctx) => {
      logger.info('PhotoHandler: upscale_neurophoto_image action', {
        telegramId: ctx.from?.id,
        sessionExists: !!ctx.session,
        lastNeuroPhotoImageUrl: ctx.session?.lastNeuroPhotoImageUrl?.substring(0, 50),
      })

      try {
        await ctx.answerCbQuery()

        const telegram_id = ctx.from?.id?.toString()
        const username = ctx.from?.username || ''
        const is_ru = isRussianFromState(ctx)

        if (!telegram_id) {
          await ctx.reply(
            is_ru ? '❌ Ошибка получения ID пользователя.' : '❌ User ID error.'
          )
          return
        }

        if (!ctx.session?.lastNeuroPhotoImageUrl) {
          logger.warn('No lastNeuroPhotoImageUrl in session', {
            telegramId: telegram_id,
            sessionData: JSON.stringify(ctx.session || {}),
          })
          await ctx.reply(
            is_ru
              ? '❌ Нет изображения для увеличения качества. Сначала сгенерируйте нейрофото.'
              : '❌ No image to upscale. Please generate a neurophoto first.'
          )
          return
        }

        await ctx.reply(
          is_ru
            ? '⌛ Увеличиваем качество нейрофото... Пожалуйста, подождите'
            : '⌛ Upscaling neurophoto quality... Please wait'
        )

        const { upscaleImage } = await import('@/services/imageUpscaler')
        await upscaleImage({
          imageUrl: ctx.session.lastNeuroPhotoImageUrl,
          telegram_id,
          username,
          is_ru,
          ctx,
          originalPrompt: ctx.session.lastNeuroPhotoPrompt || 'Neurophoto upscale',
        })
      } catch (error) {
        logger.error('Error in upscale_neurophoto_image action:', {
          error,
          telegramId: ctx.from?.id,
        })

        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при увеличении качества нейрофото.'
            : '❌ An error occurred while upscaling the neurophoto.'
        )
      }
    })

    // More editing action
    this.actionHandlers.set('more_editing', async (ctx) => {
      logger.info('PhotoHandler: more_editing action', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        const isRu = isRussianFromState(ctx)

        await ctx.reply(
          isRu
            ? '📷 Отправьте новое изображение для редактирования:'
            : '📷 Send a new image for editing:'
        )

        if (ctx.session) {
          ctx.session.awaitingFluxKontextImage = true
        }
      } catch (error) {
        logger.error('Error in more_editing action:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })

    // Different mode action
    this.actionHandlers.set('different_mode', async (ctx) => {
      logger.info('PhotoHandler: different_mode action', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        await ctx.scene.leave()
        await ctx.scene.enter('flux_kontext_scene')
      } catch (error) {
        logger.error('Error in different_mode action:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })

    // New neurophoto prompt action
    this.actionHandlers.set('new_neurophoto_prompt', async (ctx) => {
      logger.info('PhotoHandler: new_neurophoto_prompt action', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        const is_ru = isRussianFromState(ctx)

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.NeuroPhoto
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)

        await ctx.reply(
          is_ru
            ? '🆕 Начинаем создание нового нейрофото! Опишите, какую фотографию вы хотите сгенерировать.'
            : '🆕 Starting creation of a new neurophoto! Describe what kind of photo you want to generate.'
        )
      } catch (error) {
        logger.error('Error in new_neurophoto_prompt action:', {
          error,
          telegramId: ctx.from?.id,
        })

        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при создании нового промпта.'
            : '❌ An error occurred while creating a new prompt.'
        )
      }
    })

    // Change size action
    this.actionHandlers.set('change_size', async (ctx) => {
      try {
        await ctx.answerCbQuery()
        await ctx.scene.leave()
        await ctx.scene.enter(ModeEnum.SizeWizard)
      } catch (error) {
        logger.error('Error in change_size action:', {
          error,
          telegramId: ctx.from?.id,
        })

        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при изменении размера.'
            : '❌ An error occurred while changing size.'
        )
      }
    })

    // Improve prompt action
    this.actionHandlers.set('improve_prompt', async (ctx) => {
      try {
        await ctx.answerCbQuery()
        await ctx.scene.leave()
        await ctx.scene.enter(ModeEnum.ImprovePromptWizard)
      } catch (error) {
        logger.error('Error in improve_prompt action:', {
          error,
          telegramId: ctx.from?.id,
        })

        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при улучшении промпта.'
            : '❌ An error occurred while improving prompt.'
        )
      }
    })

    // Upscale another photo action
    this.actionHandlers.set('upscale_another_photo', async (ctx) => {
      const isRu = isRussianFromState(ctx)

      try {
        await ctx.answerCbQuery()
        await ctx.scene.leave()
        await ctx.scene.enter(ModeEnum.ImageUpscaler)
      } catch (error) {
        logger.error('Error in upscale_another_photo action:', {
          error,
          telegramId: ctx.from?.id,
        })

        await ctx.reply(
          isRu
            ? 'Ошибка при переходе к upscaler.'
            : 'Error switching to upscaler.'
        )
      }
    })
  }

  // Add a new photo handler
  addPhotoHandler(config: PhotoHandlerConfig): void {
    this.photoHandlers.push(config)
  }

  // Get action handler for bot registration
  getActionHandler(action: string): ((ctx: MyContext) => Promise<void>) | undefined {
    return this.actionHandlers.get(action)
  }

  // Get all action handlers for registration
  getAllActionHandlers(): string[] {
    return Array.from(this.actionHandlers.keys())
  }
}