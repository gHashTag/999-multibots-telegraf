import { MyContext } from '@/interfaces'
import { getUserDetailsSubscription } from '@/core/supabase'
import { simulateSubscriptionForDev } from '@/scenes/menuScene/helpers/simulateSubscription'
import { isDev } from '@/config'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Проверяет, имеет ли пользователь активную подписку.
 * Если подписки нет, направляет в subscriptionScene.
 *
 * @param ctx - Контекст Telegraf
 * @param commandName - Название команды для логирования
 * @returns true если подписка есть, false если нет (и пользователь перенаправлен)
 */
export async function checkSubscriptionGuard(
  ctx: MyContext,
  commandName: string
): Promise<boolean> {
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  try {
    const userDetails = await getUserDetailsSubscription(telegramId)
    const effectiveSubscription = simulateSubscriptionForDev(
      userDetails?.subscriptionType || null,
      isDev
    )

    logger.info(`[SubscriptionGuard] ${commandName}: Checking subscription`, {
      telegramId,
      originalSubscription: userDetails?.subscriptionType,
      effectiveSubscription,
      isDev,
      command: commandName,
    })

    // Если нет подписки (включая симуляцию), направляем в subscriptionScene
    if (!effectiveSubscription || effectiveSubscription === 'STARS') {
      logger.info(
        `[SubscriptionGuard] ${commandName}: No subscription, redirecting to subscription scene`,
        {
          telegramId,
          effectiveSubscription,
          command: commandName,
        }
      )

      await ctx.scene.leave()
      ctx.session.mode = ModeEnum.SubscriptionScene
      await ctx.scene.enter(ModeEnum.SubscriptionScene)
      return false
    }

    logger.info(
      `[SubscriptionGuard] ${commandName}: Subscription valid, allowing access`,
      {
        telegramId,
        effectiveSubscription,
        command: commandName,
      }
    )

    return true
  } catch (error) {
    logger.error(
      `[SubscriptionGuard] ${commandName}: Error checking subscription`,
      {
        error,
        telegramId,
        command: commandName,
      }
    )

    // В случае ошибки направляем в subscriptionScene для безопасности
    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.SubscriptionScene
    await ctx.scene.enter(ModeEnum.SubscriptionScene)
    return false
  }
}

/**
 * Список команд, которые НЕ требуют проверки подписки
 */
export const COMMANDS_WITHOUT_SUBSCRIPTION_CHECK = [
  '/start',
  '/menu', // menu сам проверяет подписку
  '/support', // техподдержка доступна всем
  'support',
  '💬 Техподдержка',
  '💬 Support',
  '💫 Оформить подписку',
  '💫 Subscribe',
]
