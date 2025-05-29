import { MyContext } from '@/interfaces'
import { getUserDetailsSubscription } from '@/core/supabase'
import { simulateSubscriptionForDev } from '@/scenes/menuScene/helpers/simulateSubscription'
import { isDev } from '@/config'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { kickUnpaidUser } from '@/middlewares/checkSubscription'
import { getSubScribeChannel } from '@/handlers/getSubScribeChannel'

/**
 * Проверяет, имеет ли пользователь активную подписку.
 * Если подписки нет, направляет в subscriptionScene и кикает из группы.
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
    if (!effectiveSubscription) {
      logger.info(
        `[SubscriptionGuard] ${commandName}: No subscription, redirecting to subscription scene`,
        {
          telegramId,
          effectiveSubscription,
          command: commandName,
        }
      )

      // Кикаем пользователя из группы, если он там есть
      try {
        const channelId = await getSubScribeChannel(ctx)
        if (channelId) {
          const isRu = ctx.from?.language_code === 'ru'
          const kickReason = isRu
            ? 'Отсутствие оплаченной подписки'
            : 'No paid subscription'

          logger.info(
            `[SubscriptionGuard] ${commandName}: Attempting to kick unpaid user from group`,
            {
              telegramId,
              channelId,
              reason: kickReason,
            }
          )

          await kickUnpaidUser(ctx, channelId, kickReason)
        }
      } catch (kickError) {
        logger.warn(
          `[SubscriptionGuard] ${commandName}: Could not kick user from group`,
          {
            error: kickError,
            telegramId,
          }
        )
        // Продолжаем выполнение даже если кик не удался
      }

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
