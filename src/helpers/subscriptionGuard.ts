import { MyContext } from '@/interfaces'
import { getUserDetailsSubscription } from '@/core/supabase'
import { simulateSubscriptionForDev } from '@/scenes/menuScene/helpers/simulateSubscription'
import { isDev, ADMIN_IDS_ARRAY } from '@/config'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { kickUnpaidUser } from '@/middlewares/checkSubscription'
import { getSubScribeChannel } from '@/handlers/getSubScribeChannel'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getSubscriptionMessage, isFeatureAvailable } from './subscriptionInfo'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { Markup } from 'telegraf'

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
  const numericTelegramId = ctx.from?.id || 0

  // 👑 ПРИВИЛЕГИЯ АДМИНОВ: Обходят проверку подписки
  if (ADMIN_IDS_ARRAY.includes(numericTelegramId)) {
    logger.info(`[SubscriptionGuard] ${commandName}: ADMIN ACCESS GRANTED`, {
      telegramId,
      command: commandName,
      adminId: numericTelegramId,
      bypass: 'subscription_check',
    })
    return true
  }

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

    // Проверяем, доступна ли функция для текущей подписки
    const isRu = isRussianFromState(ctx)
    const subscription = effectiveSubscription || SubscriptionType.NO_SUBSCRIPTION

    // Проверяем доступность функции
    if (!isFeatureAvailable(commandName, subscription)) {
      logger.info(
        `[SubscriptionGuard] ${commandName}: Feature not available for subscription`,
        {
          telegramId,
          subscription,
          command: commandName,
        }
      )

      // Отправляем информативное сообщение о доступных функциях
      const message = getSubscriptionMessage(subscription, isRu, commandName)

      // Отправляем сообщение с кнопкой оформления подписки
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '👫 Оформить подписку' : '👫 Subscribe',
              'go_to_subscription_scene'
            ),
          ],
        ]).reply_markup,
      })

      // Не перенаправляем автоматически, пользователь сам решит
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
