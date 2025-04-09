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
      return ctx.scene.enter(ModeEnum.MenuScene)
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
      // Если подписка не существует, то переходим в главное меню
      console.log('CASE: not subscribed')
      return ctx.scene.enter(ModeEnum.MenuScene)
    }
  }

  // If we reach here, subscription is valid
  if (ctx.session.mode === ModeEnum.MenuScene) {
    return ctx.scene.enter(ModeEnum.MenuScene)
  } else {
    // If we have a target scene in session, go there
    const targetScene = ctx.session.targetScene || ModeEnum.StartScene
    // Clear the target scene after use
    if (ctx.session.targetScene) {
      ctx.session.targetScene
    }
    return ctx.scene.enter(targetScene)
  }
}

export const subscriptionCheckScene = new WizardScene<MyContext>(
  ModeEnum.SubscriptionCheckScene,
  subscriptionCheckStep
)
