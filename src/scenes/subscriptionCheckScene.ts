import { TelegramId } from '@/interfaces/telegram.interface';
import { MyContext } from '@/interfaces'
import { WizardScene } from 'telegraf/scenes'
import { getUserByTelegramId } from '@/core/supabase'
import { verifySubscription } from '@/middlewares/verifySubscription'
import { getSubScribeChannel } from '@/core/supabase'
import { isDev } from '@/helpers'
import { ModeEnum } from '@/price/helpers/modelsCost'

const subscriptionCheckStep = async (ctx: MyContext) => {
  console.log('CASE: subscriptionCheckStep', ctx.from)

  const { language_code } = ctx.from
  // Проверяем существует ли пользователь в базе
  const existingUser = await getUserByTelegramId(ctx)
  console.log('subscriptionCheckStep - existingUser:', existingUser)

  // Если пользователь не существует, то переходим к созданию пользователя
  if (!existingUser) {
    console.log('CASE: user not exists')
    return ctx.scene.enter('createUserScene')
  }
  const subscription = existingUser.subscription
  // Получаем ID канала подписки
  if (subscription !== 'stars') {
    console.log('CASE: subscription not stars')
    if (isDev) {
      return ctx.scene.enter('menuScene')
    }
    const SUBSCRIBE_CHANNEL_ID = await getSubScribeChannel(ctx)
    // Проверяем подписку
    const isSubscribed = await verifySubscription(
      ctx,
      language_code.toString(),
      SUBSCRIBE_CHANNEL_ID
    )
    if (!isSubscribed) {
      // Если подписка не существует, то выходим из сцены
      console.log('CASE: not subscribed')
      // Если подписка существует, то переходим к стартовой сцене
      console.log('CASE: isSubscribed', isSubscribed)
      return ctx.scene.leave()
    }
  }

  if (ctx.session.mode === 'main_menu') {
    return ctx.scene.enter('menuScene')
  } else {
    return ctx.scene.enter('startScene')
  }
}

export const subscriptionCheckScene = new WizardScene(
  ModeEnum.SubscriptionCheckScene,
  subscriptionCheckStep
)
