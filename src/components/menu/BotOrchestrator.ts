/**
 * Bot Orchestrator - Main component that coordinates all menu handlers
 * Replaces the monolithic registerCommands function
 */
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { BotRegistrationContext } from '../shared/types'
import { logger } from '@/utils/logger'
import { message } from 'telegraf/filters'

// Import all handler components
import { MenuActionRegistry } from './MenuActionRegistry'
import { SubscriptionHandler } from './SubscriptionHandler'
import { PhotoHandler } from './PhotoHandler'
import { VideoGenerationHandler } from './VideoGenerationHandler'
import { NavigationHandler } from './NavigationHandler'
import { CommandRegistry } from './CommandRegistry'

export class BotOrchestrator {
  private menuActionRegistry: MenuActionRegistry
  private subscriptionHandler: SubscriptionHandler
  private photoHandler: PhotoHandler
  private videoGenerationHandler: VideoGenerationHandler
  private navigationHandler: NavigationHandler
  private commandRegistry: CommandRegistry

  constructor() {
    this.menuActionRegistry = new MenuActionRegistry()
    this.subscriptionHandler = new SubscriptionHandler()
    this.photoHandler = new PhotoHandler()
    this.videoGenerationHandler = new VideoGenerationHandler()
    this.navigationHandler = new NavigationHandler()
    this.commandRegistry = new CommandRegistry()

    logger.info('BotOrchestrator: All components initialized')
  }

  /**
   * Register all bot handlers and commands
   * This replaces the monolithic registerCommands function
   */
  public registerAll(bot: Telegraf<MyContext>): void {
    const context: BotRegistrationContext = { bot, logger }

    try {
      // 1. Setup logging middleware
      this.setupLoggingMiddleware(bot)

      // 2. Register commands
      this.commandRegistry.registerCommands(context)

      // 3. Register global hears handlers
      this.registerGlobalHearsHandlers(bot)

      // 4. Register action handlers (inline callbacks)
      this.registerActionHandlers(bot)

      // 5. Register photo handlers
      this.registerPhotoHandlers(bot)

      // 6. Register text message handlers
      this.registerTextHandlers(bot)

      logger.info('BotOrchestrator: All handlers registered successfully')
    } catch (error) {
      logger.error('BotOrchestrator: Failed to register handlers', { error })
      throw error
    }
  }

  private setupLoggingMiddleware(bot: Telegraf<MyContext>): void {
    bot.use((ctx, next) => {
      const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined

      logger.info('>>> RAW UPDATE RECEIVED', {
        updateId: ctx.update.update_id,
        updateType: ctx.updateType,
        messageText,
        callbackData: ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined,
        sceneInfo: ctx.scene?.current?.id,
      })

      return next()
    })
  }

  private registerGlobalHearsHandlers(bot: Telegraf<MyContext>): void {
    // Register subscription text handlers
    bot.hears(
      [
        '💫 Оформить подписку',
        '💫 Subscribe',
        '💳 Оформить подписку', // Legacy
        '💳 Subscribe' // Legacy
      ],
      async (ctx) => {
        logger.info('🚀 BotOrchestrator: Global subscription hears triggered', {
          telegramId: ctx.from?.id,
          messageText: ctx.message?.text,
        })

        const handled = await this.subscriptionHandler.handleSubscriptionText(ctx)
        if (!handled) {
          logger.warn('Subscription text not handled properly', {
            telegramId: ctx.from?.id,
          })
        }
      }
    )

    // Register other global text handlers
    this.registerGlobalTextHandlers(bot)
  }

  private registerGlobalTextHandlers(bot: Telegraf<MyContext>): void {
    // Video generation buttons
    const videoTexts = [
      '🆕 Новый промпт', '🆕 New prompt',
      '✨ Создать еще (Текст в Видео)', '✨ Create More (Text to Video)',
      '✨ Создать еще (Изображение в Видео)', '✨ Create More (Image to Video)',
      '🖼 Выбрать другую модель (Видео)', '🖼 Select Another Model (Video)',
      '📝 Текст в Видео', '📝 Text to Video',
      '🖼️ Изображение в Видео', '🖼️ Image to Video',
      '🎬 Новый промт', '🎬 New Prompt',
      '🎬 Новое видео', '🎬 New Video'
    ]

    bot.hears(videoTexts, async (ctx) => {
      logger.info('BotOrchestrator: Video generation text handler', {
        telegramId: ctx.from?.id,
        text: ctx.message?.text
      })

      const handled = await this.videoGenerationHandler.handleVideoGenerationText(ctx)
      if (!handled) {
        // Fallback to menu action registry
        await this.menuActionRegistry.handle(ctx)
      }
    })

    // Global navigation and other handlers
    bot.on(message('text'), async (ctx) => {
      // Skip if already handled by specific hears handlers
      if (this.isHandledBySpecificHears(ctx.message.text)) {
        return
      }

      logger.debug('BotOrchestrator: Processing text message', {
        telegramId: ctx.from?.id,
        text: ctx.message.text?.substring(0, 50)
      })

      // Try navigation handler first
      const navHandled = await this.navigationHandler.handleGlobalText(ctx)
      if (navHandled) {
        return
      }

      // Try menu action registry
      await this.menuActionRegistry.handle(ctx)
      // Menu action registry doesn't return a handled flag, so we continue

      // If no handler matched, let it continue to other text handlers
      logger.debug('BotOrchestrator: No handler matched for text', {
        telegramId: ctx.from?.id,
        text: ctx.message.text?.substring(0, 30)
      })
    })
  }

  private isHandledBySpecificHears(text: string): boolean {
    const specificTexts = [
      '💫 Оформить подписку', '💫 Subscribe',
      '💳 Оформить подписку', '💳 Subscribe',
      '🆕 Новый промпт', '🆕 New prompt',
      '✨ Создать еще (Текст в Видео)', '✨ Create More (Text to Video)',
      '✨ Создать еще (Изображение в Видео)', '✨ Create More (Image to Video)',
      '🖼 Выбрать другую модель (Видео)', '🖼 Select Another Model (Video)',
      '📝 Текст в Видео', '📝 Text to Video',
      '🖼️ Изображение в Видео', '🖼️ Image to Video',
      '🎬 Новый промт', '🎬 New Prompt',
      '🎬 Новое видео', '🎬 New Video'
    ]

    return specificTexts.includes(text)
  }

  private registerActionHandlers(bot: Telegraf<MyContext>): void {
    // Navigation actions
    const navActions = this.navigationHandler.getAllActionHandlers()
    navActions.forEach(action => {
      const handler = this.navigationHandler.getActionHandler(action)
      if (handler) {
        bot.action(action, handler)
        logger.debug(`Registered navigation action: ${action}`)
      }
    })

    // Subscription actions
    const subActions = this.subscriptionHandler.getAllActionHandlers()
    subActions.forEach(({ action, handler }) => {
      bot.action(action, handler)
      logger.debug(`Registered subscription action: ${action}`)
    })

    // Photo actions
    const photoActions = this.photoHandler.getAllActionHandlers()
    photoActions.forEach(action => {
      const handler = this.photoHandler.getActionHandler(action)
      if (handler) {
        bot.action(action, handler)
        logger.debug(`Registered photo action: ${action}`)
      }
    })

    // Video actions
    const videoActions = this.videoGenerationHandler.getAllActionHandlers()
    videoActions.forEach(action => {
      const handler = this.videoGenerationHandler.getActionHandler(action)
      if (handler) {
        bot.action(action, handler)
        logger.debug(`Registered video action: ${action}`)
      }
    })

    // Subscription callback pattern (subscribe_*)
    bot.action(/^subscribe_(.+)$/, async (ctx) => {
      const handler = this.subscriptionHandler.getActionHandler('subscribe_callback')
      if (handler) {
        await handler(ctx)
      }
    })

    logger.info('BotOrchestrator: All action handlers registered')
  }

  private registerPhotoHandlers(bot: Telegraf<MyContext>): void {
    bot.on(message('photo'), async (ctx) => {
      logger.info('🎯 BotOrchestrator: Photo message received', {
        telegramId: ctx.from?.id,
        currentScene: ctx.scene?.current?.id,
      })

      try {
        await this.photoHandler.handle(ctx)
      } catch (error) {
        logger.error('BotOrchestrator: Photo handler failed', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })
  }

  private registerTextHandlers(bot: Telegraf<MyContext>): void {
    // Text handlers are already registered in registerGlobalTextHandlers
    // This method can be used for additional text handling if needed
    logger.debug('BotOrchestrator: Text handlers already registered in global handlers')
  }

  // Public methods for component access
  public getMenuActionRegistry(): MenuActionRegistry {
    return this.menuActionRegistry
  }

  public getSubscriptionHandler(): SubscriptionHandler {
    return this.subscriptionHandler
  }

  public getPhotoHandler(): PhotoHandler {
    return this.photoHandler
  }

  public getVideoGenerationHandler(): VideoGenerationHandler {
    return this.videoGenerationHandler
  }

  public getNavigationHandler(): NavigationHandler {
    return this.navigationHandler
  }

  public getCommandRegistry(): CommandRegistry {
    return this.commandRegistry
  }

  // Method to add external handlers
  public addCustomHandler(handlerType: string, handler: any): void {
    switch (handlerType) {
      case 'menu':
        // Add to menu registry
        break
      case 'subscription':
        // Add to subscription handler
        break
      default:
        logger.warn('Unknown handler type', { handlerType })
    }
  }
}