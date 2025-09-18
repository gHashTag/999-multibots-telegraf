/**
 * Menu Action Registry - Handles all menu-related actions
 */
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { MenuAction, BaseHandler } from '../shared/types'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'

export class MenuActionRegistry implements BaseHandler {
  private actions: Map<string, MenuAction> = new Map()

  constructor() {
    this.initializeActions()
  }

  async handle(ctx: MyContext): Promise<void> {
    if (!ctx.message || !('text' in ctx.message)) {
      return
    }

    const text = ctx.message.text?.replace(/\s+/g, ' ').trim()
    if (!text) return

    const telegramId = ctx.from?.id?.toString() || 'unknown'

    logger.info('MenuActionRegistry: Processing text', {
      telegramId,
      text: text.substring(0, 50) + '...',
      availableActions: Array.from(this.actions.keys()).length
    })

    // Find matching action
    for (const [key, action] of this.actions.entries()) {
      const isRu = isRussianFromState(ctx)
      const targetText = isRu ? action.titles.ru : action.titles.en

      if (text === targetText) {
        logger.info('MenuActionRegistry: Action matched', {
          telegramId,
          actionKey: key,
          targetText
        })

        try {
          // Check subscription if required
          if (action.requiresSubscription) {
            const hasSubscription = await checkSubscriptionGuard(ctx, key)
            if (!hasSubscription) {
              return
            }
          }

          await action.handler(ctx)
        } catch (error) {
          logger.error('MenuActionRegistry: Action handler failed', {
            error,
            telegramId,
            actionKey: key
          })

          const isRuError = isRussianFromState(ctx)
          await ctx.reply(
            isRuError
              ? '❌ Произошла ошибка при выполнении действия.'
              : '❌ An error occurred while executing the action.'
          )
        }
        return
      }
    }

    logger.debug('MenuActionRegistry: No action matched', {
      telegramId,
      text: text.substring(0, 50)
    })
  }

  private initializeActions(): void {
    // Main menu navigation actions
    this.addAction('subscription', {
      titles: {
        ru: '💫 Оформить подписку',
        en: '💫 Subscribe'
      },
      handler: async (ctx) => {
        logger.info('MenuAction: Subscription', {
          telegramId: ctx.from?.id
        })

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.SubscriptionScene
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
      }
    })

    this.addAction('new_neurophoto_prompt', {
      titles: {
        ru: '🆕 Новый промпт',
        en: '🆕 New prompt'
      },
      handler: async (ctx) => {
        const isRu = isRussianFromState(ctx)

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.NeuroPhoto
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)

        await ctx.reply(
          isRu
            ? '🆕 Начинаем создание нового нейрофото! Опишите, какую фотографию вы хотите сгенерировать.'
            : '🆕 Starting creation of a new neurophoto! Describe what kind of photo you want to generate.'
        )
      }
    })

    // Video generation actions
    this.addVideoActions()

    // Navigation actions
    this.addNavigationActions()
  }

  private addVideoActions(): void {
    // Text-to-Video actions
    this.addAction('create_more_text_to_video', {
      titles: {
        ru: '✨ Создать еще (Текст в Видео)',
        en: '✨ Create More (Text to Video)'
      },
      requiresSubscription: true,
      handler: async (ctx) => {
        const isRu = isRussianFromState(ctx)

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.TextToVideo
        await ctx.scene.enter(ModeEnum.TextToVideo)

        await ctx.reply(
          isRu
            ? '🎬 Создаем новое видео из текста! Выберите модель:'
            : '🎬 Creating a new video from text! Select a model:'
        )
      }
    })

    // Image-to-Video actions
    this.addAction('create_more_image_to_video', {
      titles: {
        ru: '✨ Создать еще (Изображение в Видео)',
        en: '✨ Create More (Image to Video)'
      },
      requiresSubscription: true,
      handler: async (ctx) => {
        const isRu = isRussianFromState(ctx)

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.ImageToVideo
        await ctx.scene.enter(ModeEnum.ImageToVideo)

        await ctx.reply(
          isRu
            ? '🖼️ Создаем новое видео из изображения! Выберите модель:'
            : '🖼️ Creating a new video from image! Select a model:'
        )
      }
    })

    // Video model selection
    this.addAction('select_another_video_model', {
      titles: {
        ru: '🖼 Выбрать другую модель (Видео)',
        en: '🖼 Select Another Model (Video)'
      },
      requiresSubscription: true,
      handler: async (ctx) => {
        const isRu = isRussianFromState(ctx)

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
    })

    // Text to Video selection
    this.addAction('text_to_video_selection', {
      titles: {
        ru: '📝 Текст в Видео',
        en: '📝 Text to Video'
      },
      requiresSubscription: true,
      handler: async (ctx) => {
        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.TextToVideo
        await ctx.scene.enter(ModeEnum.TextToVideo)
      }
    })

    // Image to Video selection
    this.addAction('image_to_video_selection', {
      titles: {
        ru: '🖼️ Изображение в Видео',
        en: '🖼️ Image to Video'
      },
      requiresSubscription: true,
      handler: async (ctx) => {
        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.ImageToVideo
        await ctx.scene.enter(ModeEnum.ImageToVideo)
      }
    })

    // New video prompt actions
    this.addAction('new_prompt_video', {
      titles: {
        ru: '🎬 Новый промт',
        en: '🎬 New Prompt'
      },
      handler: async (ctx) => {
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
    })

    this.addAction('new_video_i2v', {
      titles: {
        ru: '🎬 Новое видео',
        en: '🎬 New Video'
      },
      handler: async (ctx) => {
        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.ImageToVideo
        await ctx.scene.enter(ModeEnum.ImageToVideo)
      }
    })
  }

  private addNavigationActions(): void {
    // Add other navigation actions here
    // This can be expanded based on the levels configuration
  }

  private addAction(key: string, action: MenuAction): void {
    this.actions.set(key, action)
  }

  // Public method to get all registered actions
  public getActions(): Map<string, MenuAction> {
    return new Map(this.actions)
  }

  // Method to add external actions
  public registerAction(key: string, action: MenuAction): void {
    this.addAction(key, action)
  }
}