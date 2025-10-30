/**
 * Example: Bot using refactored components
 * This demonstrates how to use the new modular architecture
 */
import { Telegraf, Scenes, session } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { BotOrchestrator } from '@/components/menu'
import { logger } from '@/utils/logger'

// Example of creating a bot with the new refactored components
export function createBotWithRefactoredComponents(token: string): Telegraf<MyContext> {
  const bot = new Telegraf<MyContext>(token)

  try {
    // 1. Setup basic middleware (session, logging, etc.)
    bot.use(session())

    // 2. Create and configure the orchestrator
    const orchestrator = new BotOrchestrator()

    // 3. Register all components with the bot
    orchestrator.registerAll(bot)

    // 4. Access individual components if needed
    const menuRegistry = orchestrator.getMenuActionRegistry()
    const subscriptionHandler = orchestrator.getSubscriptionHandler()
    const photoHandler = orchestrator.getPhotoHandler()

    logger.info('Bot created with refactored components', {
      menuActions: menuRegistry.getActions().size,
      subscriptionHandlers: subscriptionHandler.getAllActionHandlers().length,
      photoHandlers: photoHandler.getAllActionHandlers().length
    })

    // 5. Add custom actions if needed
    menuRegistry.registerAction('custom_action', {
      titles: {
        ru: 'Кастомная кнопка',
        en: 'Custom button'
      },
      handler: async (ctx) => {
        await ctx.reply('Custom action handled!')
      }
    })

    // 6. Add custom navigation if needed
    const navigationHandler = orchestrator.getNavigationHandler()
    navigationHandler.addNavigationAction('custom_nav', async (ctx) => {
      await ctx.scene.enter('custom_scene')
    })

    // 7. Add custom photo handler if needed
    photoHandler.addPhotoHandler({
      condition: (ctx) => !!ctx.session?.awaitingAiPhotoshopImage,
      handler: async (ctx) => {
        await ctx.reply('Custom photo processed!')
        if (ctx.session) ctx.session.awaitingAiPhotoshopImage = false
      },
      priority: 50
    })

    logger.info('Bot setup completed successfully')

  } catch (error) {
    logger.error('Failed to setup bot with refactored components', { error })
    throw error
  }

  return bot
}

// Example of extending components
export class CustomMenuExtension {
  constructor(private orchestrator: BotOrchestrator) {}

  addCustomActions(): void {
    const menuRegistry = this.orchestrator.getMenuActionRegistry()

    // Add multiple custom actions
    const customActions = [
      {
        key: 'special_feature',
        config: {
          titles: {
            ru: '🌟 Специальная функция',
            en: '🌟 Special Feature'
          },
          requiresSubscription: true,
          handler: async (ctx: MyContext) => {
            await ctx.reply('Special feature activated!')
          }
        }
      },
      {
        key: 'beta_test',
        config: {
          titles: {
            ru: '🧪 Бета тест',
            en: '🧪 Beta Test'
          },
          handler: async (ctx: MyContext) => {
            await ctx.reply('Welcome to beta testing!')
          }
        }
      }
    ]

    customActions.forEach(({ key, config }) => {
      menuRegistry.registerAction(key, config)
    })

    logger.info(`Added ${customActions.length} custom actions`)
  }
}

// Example of monitoring component health
export class ComponentHealthMonitor {
  constructor(private orchestrator: BotOrchestrator) {}

  getHealthStatus(): Record<string, any> {
    const menuRegistry = this.orchestrator.getMenuActionRegistry()
    const subscriptionHandler = this.orchestrator.getSubscriptionHandler()
    const photoHandler = this.orchestrator.getPhotoHandler()
    const videoHandler = this.orchestrator.getVideoGenerationHandler()
    const navigationHandler = this.orchestrator.getNavigationHandler()
    const commandRegistry = this.orchestrator.getCommandRegistry()

    return {
      menuActions: menuRegistry.getActions().size,
      subscriptionHandlers: subscriptionHandler.getAllActionHandlers().length,
      photoHandlers: photoHandler.getAllActionHandlers().length,
      videoHandlers: videoHandler.getAllActionHandlers().length,
      navigationHandlers: navigationHandler.getAllActionHandlers().length,
      commands: commandRegistry.getCommands().size,
      timestamp: new Date().toISOString()
    }
  }

  logHealthStatus(): void {
    const status = this.getHealthStatus()
    logger.info('Component health status', status)
  }
}

// Example usage
export function exampleUsage(): void {
  // Create bot
  const bot = createBotWithRefactoredComponents('YOUR_BOT_TOKEN')

  // Get orchestrator reference (in real app, you'd store this)
  const orchestrator = new BotOrchestrator()

  // Add custom extensions
  const customExtension = new CustomMenuExtension(orchestrator)
  customExtension.addCustomActions()

  // Monitor health
  const healthMonitor = new ComponentHealthMonitor(orchestrator)
  healthMonitor.logHealthStatus()

  // Start bot
  bot.launch()

  logger.info('Bot started with refactored components')
}

// Example of graceful error handling
export function createRobustBot(token: string): Telegraf<MyContext> {
  const bot = new Telegraf<MyContext>(token)

  try {
    // Basic setup
    bot.use(session())

    // Create orchestrator with error handling
    const orchestrator = new BotOrchestrator()

    // Wrap registration in try-catch
    try {
      orchestrator.registerAll(bot)
      logger.info('All components registered successfully')
    } catch (registrationError) {
      logger.error('Component registration failed', { registrationError })
      // Fallback to basic bot functionality
      setupBasicFallback(bot)
    }

    // Global error handler
    bot.catch((error: any, ctx: MyContext) => {
      logger.error('Bot error occurred', {
        error: error.message,
        telegramId: ctx.from?.id,
        updateType: ctx.updateType
      })

      // Send user-friendly error message
      ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {
        // Ignore reply errors
      })
    })

  } catch (error) {
    logger.error('Failed to create robust bot', { error })
    throw error
  }

  return bot
}

function setupBasicFallback(bot: Telegraf<MyContext>): void {
  // Minimal fallback functionality
  bot.start((ctx) => ctx.reply('Бот временно работает в ограниченном режиме'))
  bot.help((ctx) => ctx.reply('Справка временно недоступна'))

  logger.warn('Bot running in fallback mode with limited functionality')
}