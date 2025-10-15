/**
 * Navigation Handler - Manages navigation actions and global callbacks
 */
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { BaseHandler } from '../shared/types'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { levels } from '@/menu/mainMenu'

export class NavigationHandler implements BaseHandler {
  private actionHandlers: Map<string, (ctx: MyContext) => Promise<void>> = new Map()
  private globalTextHandlers: Map<string, (ctx: MyContext) => Promise<void>> = new Map()

  constructor() {
    this.initializeActionHandlers()
    this.initializeGlobalTextHandlers()
  }

  async handle(ctx: MyContext): Promise<void> {
    // Handle navigation requests
    logger.debug('NavigationHandler: Processing request', {
      telegramId: ctx.from?.id,
      updateType: ctx.updateType
    })
  }

  private initializeActionHandlers(): void {
    // Go to main menu
    this.actionHandlers.set('go_main_menu', async (ctx) => {
      logger.info('NavigationHandler: go_main_menu action', { telegramId: ctx.from?.id })

      try {
        await ctx.answerCbQuery()
        await ctx.scene.leave()
        await ctx.scene.enter(ModeEnum.MainMenu)
      } catch (error) {
        logger.error('Error in go_main_menu action:', {
          error,
          telegramId: ctx.from?.id,
        })

        try {
          await ctx.reply('Ошибка при переходе в меню.')
        } catch {
          // Ignore reply errors
        }
      }
    })

    // Go to help
    this.actionHandlers.set('go_help', async (ctx) => {
      logger.info('NavigationHandler: go_help action', { telegramId: ctx.from?.id })

      try {
        await ctx.answerCbQuery()
        await ctx.scene.enter('helpScene')
      } catch (error) {
        logger.error('Error in go_help action:', {
          error,
          telegramId: ctx.from?.id,
        })

        try {
          await ctx.reply('Ошибка при открытии справки.')
        } catch {
          // Ignore reply errors
        }
      }
    })

    // Go back
    this.actionHandlers.set('go_back', async (ctx) => {
      logger.info('NavigationHandler: go_back action', { telegramId: ctx.from?.id })

      try {
        await ctx.answerCbQuery()
        await ctx.scene.leave()
      } catch (error) {
        logger.error('Error in go_back action:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })

    // Morphing handler
    this.actionHandlers.set('morphing_handler', async (ctx) => {
      logger.info('NavigationHandler: morphing button triggered', {
        telegramId: ctx.from?.id,
      })

      try {
        const isRu = isRussianFromState(ctx)

        // Check subscription
        const { checkSubscriptionGuard } = await import('@/helpers/subscriptionGuard')
        const hasSubscription = await checkSubscriptionGuard(ctx, levels[13].title_ru)
        if (!hasSubscription) {
          return
        }

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.MorphingWizard
        await ctx.scene.enter(ModeEnum.MorphingWizard)
      } catch (error) {
        logger.error('Error in morphing handler:', {
          error: error instanceof Error ? error.message : String(error),
          telegramId: ctx.from?.id,
        })

        const isRuError = isRussianFromState(ctx)
        await ctx.reply(
          isRuError
            ? '❌ Произошла ошибка при переходе к созданию морфинга.'
            : '❌ An error occurred while switching to morphing creation.'
        )
      }
    })
  }

  private initializeGlobalTextHandlers(): void {
    // Tech support handler
    this.globalTextHandlers.set('tech_support', async (ctx) => {
      logger.info('NavigationHandler: Tech support text button')

      await ctx.scene.leave()
      const { handleTechSupport } = await import('@/commands/handleTechSupport')
      await handleTechSupport(ctx)
    })
  }

  // Handle global text navigation
  async handleGlobalText(ctx: MyContext): Promise<boolean> {
    if (!ctx.message || !('text' in ctx.message)) {
      return false
    }

    const text = ctx.message.text

    // Check for tech support
    if ([levels[103].title_ru, levels[103].title_en].includes(text)) {
      logger.info('NavigationHandler: Tech support button pressed')
      await this.globalTextHandlers.get('tech_support')!(ctx)
      return true
    }

    // Check for morphing button
    if ([levels[13].title_ru, levels[13].title_en].includes(text)) {
      await this.actionHandlers.get('morphing_handler')!(ctx)
      return true
    }

    return false
  }

  // Handle callback queries for navigation
  async handleCallbackQuery(ctx: MyContext): Promise<boolean> {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      return false
    }

    const data = ctx.callbackQuery.data
    const handler = this.actionHandlers.get(data)

    if (handler) {
      logger.info('NavigationHandler: Callback query handled', {
        telegramId: ctx.from?.id,
        callbackData: data
      })

      try {
        await handler(ctx)
        return true
      } catch (error) {
        logger.error('NavigationHandler: Callback handler failed', {
          error,
          telegramId: ctx.from?.id,
          callbackData: data
        })

        try {
          await ctx.answerCbQuery('Произошла ошибка')
        } catch {
          // Ignore answer errors
        }
        return true
      }
    }

    return false
  }

  // Get action handler for bot registration
  getActionHandler(action: string): ((ctx: MyContext) => Promise<void>) | undefined {
    return this.actionHandlers.get(action)
  }

  // Get all action handlers for registration
  getAllActionHandlers(): string[] {
    return Array.from(this.actionHandlers.keys())
  }

  // Add a new navigation action
  addNavigationAction(action: string, handler: (ctx: MyContext) => Promise<void>): void {
    this.actionHandlers.set(action, handler)
  }

  // Add a new global text handler
  addGlobalTextHandler(key: string, handler: (ctx: MyContext) => Promise<void>): void {
    this.globalTextHandlers.set(key, handler)
  }
}