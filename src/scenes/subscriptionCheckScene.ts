import { MyContext } from '@/interfaces'
import { WizardScene } from 'telegraf/scenes'
import { getUserByTelegramIdString } from '@/core/supabase'
import { verifySubscription } from '@/middlewares/verifySubscription'
import { getSubScribeChannel } from '@/core/supabase'
import { isDev } from '@/helpers'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { logger } from '@/utils/logger'

const subscriptionCheckStep = async (ctx: MyContext) => {
  if (!ctx.from?.id) {
    logger.info('CASE: user not found')
    return ctx.scene.enter(ModeEnum.CreateUserScene)
  }
  // Проверяем существует ли пользователь в базе
  const existingUser = await getUserByTelegramIdString(
    ctx.from?.id.toString() || ''
  )

  // Если пользователь не существует, то переходим к созданию пользователя
  if (!existingUser) {
    logger.info('CASE: user not exists')
    return ctx.scene.enter(ModeEnum.CreateUserScene)
  }
  const subscription = existingUser.subscription
  // Получаем ID канала подписки
  if (subscription !== 'stars') {
    logger.info('CASE: subscription not stars')
    if (isDev) {
      return ctx.scene.enter('menuScene')
    }
    const SUBSCRIBE_CHANNEL_ID = await getSubScribeChannel(ctx)
    const language_code = existingUser.language_code
    if (!SUBSCRIBE_CHANNEL_ID) {
      logger.info('CASE: SUBSCRIBE_CHANNEL_ID not found')
      await ctx.reply(
        language_code === 'ru'
          ? '❌ Не удалось получить ID канала подписки'
          : '❌ Failed to get subscribe channel ID'
      )
      return ctx.scene.leave()
    }
    // Проверяем подписку
    const isSubscribed = await verifySubscription(
      ctx,
      language_code.toString(),
      SUBSCRIBE_CHANNEL_ID
    )
    if (!isSubscribed) {
      // Если подписка не существует, то выходим из сцены
      logger.info('CASE: not subscribed')
      // Если подписка существует, то переходим к стартовой сцене
      logger.info('CASE: isSubscribed', isSubscribed)
      return ctx.scene.leave()
    }
  }

  if (ctx.session.mode === ModeEnum.MainMenu) {
    return ctx.scene.enter('menuScene')
  } else {
    return ctx.scene.enter(ctx.session.mode)
  }
}

export const subscriptionCheckScene = new WizardScene(
  ModeEnum.SubscriptionCheckScene,
  subscriptionCheckStep
)
