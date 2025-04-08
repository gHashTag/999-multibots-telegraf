import { MyContext } from '@/interfaces'
import { WizardScene } from 'telegraf/scenes'
import { getUserByTelegramIdString } from '@/core/supabase'
import { verifySubscription } from '@/middlewares/verifySubscription'
import { getSubScribeChannel } from '@/core/supabase'
import { isDev } from '@/helpers'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { Scenes } from 'telegraf'

const subscriptionCheckStep = async (ctx: MyContext) => {
  console.log('CASE: subscriptionCheckStep', ctx.from)
  if (!ctx.from?.id) {
    console.log('CASE: user not found')
    return ctx.scene.enter(ModeEnum.CreateUserScene)
  }
  // Проверяем существует ли пользователь в базе
  const existingUser = await getUserByTelegramIdString(
    ctx.from?.id.toString() || ''
  )
  console.log('subscriptionCheckStep - existingUser:', existingUser)

  // Если пользователь не существует, то переходим к созданию пользователя
  if (!existingUser) {
    console.log('CASE: user not exists')
    return ctx.scene.enter(ModeEnum.CreateUserScene)
  }
  const subscription = existingUser.subscription
  // Получаем ID канала подписки
  if (subscription !== 'stars') {
    console.log('CASE: subscription not stars')
    if (isDev) {
      return ctx.scene.enter(ModeEnum.MainMenu)
    }
    const SUBSCRIBE_CHANNEL_ID = await getSubScribeChannel(ctx)
    const language_code = existingUser.language_code
    if (!SUBSCRIBE_CHANNEL_ID) {
      console.log('CASE: SUBSCRIBE_CHANNEL_ID not found')
      await ctx.reply(
        language_code === 'ru'
          ? '❌ Не удалось получить ID канала подписки'
          : '❌ Failed to get subscribe channel ID'
      )
      return ctx.scene.enter(ModeEnum.MainMenu)
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
      return ctx.scene.enter(ModeEnum.MainMenu)
    }
  }

  // If we reach here, subscription is valid
  if (ctx.session.mode === ModeEnum.MainMenu) {
    return ctx.scene.enter(ModeEnum.MainMenu)
  } else {
    // If we have a target scene in session, go there
    const targetScene = ctx.session.targetScene || ModeEnum.StartScene
    delete ctx.session.targetScene // Clear the target scene after use
    return ctx.scene.enter(targetScene)
  }
}

export const subscriptionCheckScene = new Scenes.BaseScene<MyContext>(ModeEnum.SubscriptionCheckScene)

// Use the single subscription check logic
subscriptionCheckScene.enter(subscriptionCheckStep)
