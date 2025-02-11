import { MyContext } from '@/interfaces'
import { WizardScene } from 'telegraf/scenes'
import { getUserByTelegramId } from '@/core/supabase'
import { verifySubscription } from '@/middlewares/verifySubscription'
import { getSubScribeChannel } from '@/handlers'

const subscriptionCheckStep = async (ctx: MyContext) => {
  console.log('CASE: subscriptionCheckStep', ctx.from)

  const { id: language_code } = ctx.from
  // Проверяем существует ли пользователь в базе
  const existingUser = await getUserByTelegramId(ctx)
  console.log('subscriptionCheckStep - existingUser:', existingUser)

  // Если пользователь не существует, то переходим к созданию пользователя
  if (!existingUser) {
    console.log('CASE: user not exists')
    return ctx.scene.enter('createUserScene')
  }

  // Получаем ID канала подписки
  const SUBSCRIBE_CHANNEL_ID = getSubScribeChannel(ctx)
  // Проверяем подписку
  const isSubscribed = await verifySubscription(
    ctx,
    language_code.toString(),
    SUBSCRIBE_CHANNEL_ID
  )
  if (!isSubscribed) {
    // Если подписка не существует, то выходим из сцены
    console.log('CASE: not subscribed')
    return ctx.scene.leave()
  }
  // Если подписка существует, то переходим к стартовой сцене
  console.log('CASE: isSubscribed', isSubscribed)
  return ctx.scene.enter('startScene')
}

export const subscriptionCheckScene = new WizardScene(
  'subscriptionCheckScene',
  subscriptionCheckStep
)
