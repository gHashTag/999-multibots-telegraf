/**
 * Video Generation Handler - Manages video-related operations and inline actions
 */
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { BaseHandler, VideoGenerationConfig } from '../shared/types'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'

export class VideoGenerationHandler implements BaseHandler {
  private actionHandlers: Map<string, (ctx: MyContext) => Promise<void>> = new Map()
  private videoConfigs: Map<string, VideoGenerationConfig> = new Map()

  constructor() {
    this.initializeVideoConfigs()
    this.initializeActionHandlers()
  }

  async handle(ctx: MyContext): Promise<void> {
    // This can be used for general video generation handling
    logger.debug('VideoGenerationHandler: Processing request', {
      telegramId: ctx.from?.id,
      updateType: ctx.updateType
    })
  }

  private initializeVideoConfigs(): void {
    this.videoConfigs.set('text_to_video', {
      mode: 'text_to_video',
      titles: {
        ru: '📝 Текст в Видео',
        en: '📝 Text to Video'
      },
      sceneId: ModeEnum.TextToVideo,
      requiresSubscription: true
    })

    this.videoConfigs.set('image_to_video', {
      mode: 'image_to_video',
      titles: {
        ru: '🖼️ Изображение в Видео',
        en: '🖼️ Image to Video'
      },
      sceneId: ModeEnum.ImageToVideo,
      requiresSubscription: true
    })
  }

  private initializeActionHandlers(): void {
    // Text-to-Video inline actions
    this.actionHandlers.set('create_more_text_to_video', async (ctx) => {
      logger.info('VideoHandler: create_more_text_to_video action', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        const isRu = isRussianFromState(ctx)

        const hasSubscription = await checkSubscriptionGuard(ctx, 'Text-to-Video')
        if (!hasSubscription) {
          return
        }

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.TextToVideo
        await ctx.scene.enter(ModeEnum.TextToVideo)

        await ctx.reply(
          isRu
            ? '🎬 Создаем новое видео из текста! Выберите модель:'
            : '🎬 Creating a new video from text! Select a model:'
        )
      } catch (error) {
        logger.error('Error in create_more_text_to_video action:', {
          error,
          telegramId: ctx.from?.id,
        })

        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при создании нового видео.'
            : '❌ An error occurred while creating a new video.'
        )
      }
    })

    // Image-to-Video inline actions
    this.actionHandlers.set('create_more_image_to_video', async (ctx) => {
      logger.info('VideoHandler: create_more_image_to_video action', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        const isRu = isRussianFromState(ctx)

        const hasSubscription = await checkSubscriptionGuard(ctx, 'Image-to-Video')
        if (!hasSubscription) {
          return
        }

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.ImageToVideo
        await ctx.scene.enter(ModeEnum.ImageToVideo)

        await ctx.reply(
          isRu
            ? '🖼️ Создаем новое видео из изображения! Выберите модель:'
            : '🖼️ Creating a new video from image! Select a model:'
        )
      } catch (error) {
        logger.error('Error in create_more_image_to_video action:', {
          error,
          telegramId: ctx.from?.id,
        })

        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при создании нового видео.'
            : '❌ An error occurred while creating a new video.'
        )
      }
    })

    // Video status update handler
    this.actionHandlers.set('update_video_status', async (ctx) => {
      logger.info('🔄 VideoHandler: update_video_status action', {
        telegramId: ctx.from?.id,
      })

      try {
        const { handleVideoStatusUpdate } = await import('@/handlers/handleTextToVideoDirect')
        await handleVideoStatusUpdate(ctx)
      } catch (error) {
        logger.error('Error in update_video_status action:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })

    // Main menu from video context
    this.actionHandlers.set('main_menu', async (ctx) => {
      logger.info('🏠 VideoHandler: main_menu action', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        await ctx.deleteMessage().catch(() => {
          // Ignore error if message already deleted
        })
        await ctx.scene.enter(ModeEnum.MainMenu)
      } catch (error) {
        logger.error('Error in main_menu action:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })
  }

  // Handle video generation text buttons
  async handleVideoGenerationText(ctx: MyContext): Promise<boolean> {
    if (!ctx.message || !('text' in ctx.message)) {
      return false
    }

    const text = ctx.message.text
    const isRu = isRussianFromState(ctx)

    // Check for video generation buttons
    const videoActions = [
      {
        texts: ['✨ Создать еще (Текст в Видео)', '✨ Create More (Text to Video)'],
        mode: ModeEnum.TextToVideo,
        feature: 'Text-to-Video'
      },
      {
        texts: ['✨ Создать еще (Изображение в Видео)', '✨ Create More (Image to Video)'],
        mode: ModeEnum.ImageToVideo,
        feature: 'Image-to-Video'
      },
      {
        texts: ['🖼 Выбрать другую модель (Видео)', '🖼 Select Another Model (Video)'],
        mode: null, // Special handling
        feature: 'Video Generation'
      },
      {
        texts: ['📝 Текст в Видео', '📝 Text to Video'],
        mode: ModeEnum.TextToVideo,
        feature: 'Text-to-Video'
      },
      {
        texts: ['🖼️ Изображение в Видео', '🖼️ Image to Video'],
        mode: ModeEnum.ImageToVideo,
        feature: 'Image-to-Video'
      },
      {
        texts: ['🎬 Новый промт', '🎬 New Prompt'],
        mode: null, // Context-dependent
        feature: 'Video Generation'
      },
      {
        texts: ['🎬 Новое видео', '🎬 New Video'],
        mode: ModeEnum.ImageToVideo,
        feature: 'Image-to-Video'
      }
    ]

    for (const action of videoActions) {
      if (action.texts.includes(text)) {
        logger.info('VideoHandler: Video generation text button triggered', {
          telegramId: ctx.from?.id,
          text,
          feature: action.feature
        })

        try {
          // Post-generation buttons (regenerate/change model) should NOT check subscription
          // These are only shown after successful generation, meaning user already has access
          const isPostGenerationButton =
            text.includes('Создать еще') || text.includes('Create More') ||
            text.includes('Выбрать другую модель') || text.includes('Select Another Model') ||
            text.includes('Новый промт') || text.includes('New Prompt') ||
            text.includes('Новое видео') || text.includes('New Video')

          // Only check subscription for initial access, not for post-generation actions
          if (!isPostGenerationButton) {
            const hasSubscription = await checkSubscriptionGuard(ctx, action.feature)
            if (!hasSubscription) {
              return true
            }
          } else {
            logger.info('VideoHandler: Skipping subscription check for post-generation button', {
              telegramId: ctx.from?.id,
              text,
              feature: action.feature
            })
          }

          // Special handling for different actions
          if (text.includes('Выбрать другую модель') || text.includes('Select Another Model')) {
            await this.handleVideoModelSelection(ctx, isRu)
          } else if (text.includes('Новый промт') || text.includes('New Prompt')) {
            await this.handleNewPrompt(ctx)
          } else if (action.mode) {
            await ctx.scene.leave()
            ctx.session.mode = action.mode
            await ctx.scene.enter(action.mode)
          }

          return true
        } catch (error) {
          logger.error('Error in video generation text handler:', {
            error,
            telegramId: ctx.from?.id,
            text
          })

          await ctx.reply(
            isRu
              ? '❌ Произошла ошибка при обработке видео-команды.'
              : '❌ An error occurred while processing video command.'
          )
          return true
        }
      }
    }

    return false
  }

  private async handleVideoModelSelection(ctx: MyContext, isRu: boolean): Promise<void> {
    await ctx.scene.leave()

    await ctx.reply(
      isRu
        ? '🎬 Выберите тип генерации видео:'
        : '🎬 Choose video generation type:',
      {
        reply_markup: {
          keyboard: [
            [
              isRu ? '📝 Текст в Видео' : '📝 Text to Video',
              isRu ? '🖼️ Изображение в Видео' : '🖼️ Image to Video',
            ],
            [isRu ? '🏠 Главное меню' : '🏠 Main Menu'],
          ],
          resize_keyboard: true
        }
      }
    )
  }

  private async handleNewPrompt(ctx: MyContext): Promise<void> {
    const lastMode = ctx.session.mode

    if (lastMode === ModeEnum.ImageToVideo) {
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.ImageToVideo
      await ctx.scene.enter(ModeEnum.ImageToVideo)
    } else {
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.TextToVideo
      await ctx.scene.enter(ModeEnum.TextToVideo)
    }
  }

  // Get action handler for bot registration
  getActionHandler(action: string): ((ctx: MyContext) => Promise<void>) | undefined {
    return this.actionHandlers.get(action)
  }

  // Get all action handlers for registration
  getAllActionHandlers(): string[] {
    return Array.from(this.actionHandlers.keys())
  }

  // Get video configuration
  getVideoConfig(mode: string): VideoGenerationConfig | undefined {
    return this.videoConfigs.get(mode)
  }

  // Add a new video configuration
  addVideoConfig(mode: string, config: VideoGenerationConfig): void {
    this.videoConfigs.set(mode, config)
  }
}