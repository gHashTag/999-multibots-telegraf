/**
 * Subscription Handler - Manages subscription-related operations
 */
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { BaseHandler, ActionHandlerContext } from '../shared/types'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'

export class SubscriptionHandler implements BaseHandler {
  private actionHandlers: Map<string, (ctx: MyContext) => Promise<void>> = new Map()

  constructor() {
    this.initializeActionHandlers()
  }

  async handle(ctx: MyContext): Promise<void> {
    // This will be called for subscription-related operations
    // Implementation depends on the specific context
  }

  private initializeActionHandlers(): void {
    // Global subscription button handler
    this.actionHandlers.set('go_to_subscription_scene', async (ctx) => {
      logger.info('🚀 SubscriptionHandler: go_to_subscription_scene', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.SubscriptionScene
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
        logger.info('Successfully entered subscription scene via subscription handler')
      } catch (error) {
        logger.error('Error in go_to_subscription_scene action:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? '❌ Ошибка при переходе к оформлению подписки.'
            : '❌ Error entering subscription.'
        )
      }
    })

    // Subscription inline callback handler
    this.actionHandlers.set('subscribe_callback', async (ctx) => {
      // Extract subscription type from callback data
      const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : ''
      const match = callbackData.match(/^subscribe_(.+)$/)
      const subscriptionType = match ? match[1] : 'unknown'

      logger.info('🚀 SubscriptionHandler: Subscribe button pressed', {
        telegramId: ctx.from?.id,
        subscriptionType: subscriptionType,
      })

      try {
        await ctx.answerCbQuery()
        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.SubscriptionScene
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
        logger.info('Successfully entered subscription scene via inline callback')
      } catch (error) {
        logger.error('Error in subscription inline callback:', {
          error: error instanceof Error ? error.message : String(error),
          telegramId: ctx.from?.id,
          subscriptionType: subscriptionType,
        })

        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? '❌ Ошибка при переходе к оформлению подписки.'
            : '❌ Error entering subscription.'
        )
      }
    })

    // Subscription menu from top-up
    this.actionHandlers.set('subscription_menu', async (ctx) => {
      logger.info('💫 SubscriptionHandler: subscription_menu from top-up', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        await ctx.deleteMessage().catch(() => {
          // Ignore error if message already deleted
        })
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
      } catch (error) {
        logger.error('Error in subscription_menu action:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })

    // Continue solo action
    this.actionHandlers.set('continue_solo', async (ctx) => {
      const isRu = isRussianFromState(ctx)
      logger.info('SubscriptionHandler: continue_solo', {
        telegramId: ctx.from?.id,
      })

      try {
        await ctx.answerCbQuery()
        await ctx.reply(
          isRu
            ? '👍 Отлично! Продолжайте пользоваться ботом самостоятельно. Если понадобится помощь - обращайтесь!'
            : '👍 Great! Continue using the bot on your own. If you need help - feel free to ask!'
        )
      } catch (error) {
        logger.error('Error in continue_solo action:', {
          error,
          telegramId: ctx.from?.id,
        })
      }
    })
  }

  // Handle subscription text buttons
  async handleSubscriptionText(ctx: MyContext): Promise<boolean> {
    if (!ctx.message || !('text' in ctx.message)) {
      return false
    }

    const text = ctx.message.text
    const subscriptionTexts = [
      '💫 Оформить подписку',
      '💫 Subscribe',
      '💳 Оформить подписку', // Legacy
      '💳 Subscribe' // Legacy
    ]

    if (!subscriptionTexts.includes(text)) {
      return false
    }

    logger.info('🚀 SubscriptionHandler: Subscription text button triggered', {
      telegramId: ctx.from?.id,
      messageText: text,
      currentScene: ctx.scene?.current?.id,
    })

    try {
      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.SubscriptionScene
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
      logger.info('Successfully entered subscription scene via text button')
      return true
    } catch (error) {
      logger.error('Error in subscription text handler:', {
        error: error instanceof Error ? error.message : String(error),
        telegramId: ctx.from?.id,
      })

      const isRu = isRussianFromState(ctx)
      await ctx.reply(
        isRu
          ? '❌ Ошибка при переходе к оформлению подписки.'
          : '❌ Error entering subscription.'
      )
      return true // Still handled, even if failed
    }
  }

  // Get action handler for bot registration
  getActionHandler(action: string): ((ctx: MyContext) => Promise<void>) | undefined {
    return this.actionHandlers.get(action)
  }

  // Get all action handlers for registration
  getAllActionHandlers(): ActionHandlerContext[] {
    return Array.from(this.actionHandlers.entries()).map(([action, handler]) => ({
      action,
      handler,
      requiresAnswer: true
    }))
  }

  // Check if user has valid subscription
  async checkSubscription(ctx: MyContext, featureName: string): Promise<boolean> {
    return await checkSubscriptionGuard(ctx, featureName)
  }
}