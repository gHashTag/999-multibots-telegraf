import { MyContext } from '@/interfaces'
import { WizardScene } from 'telegraf/scenes'
import { getUserByTelegramId } from '@/core/supabase'
// Используем финальную функцию проверки подписки по типу в payments_v2
import { checkActivePaymentSubscription } from '@/core/supabase/checkSubscriptionByTelegramId'
import { verifySubscription } from '@/middlewares/verifySubscription'
import { getSubScribeChannel } from '@/handlers'

const subscriptionCheckStep = async (ctx: MyContext) => {
  console.log('CASE: subscriptionCheckScene started', ctx.from?.id)

  const { language_code } = ctx.from
  const telegramId = ctx.from.id

  // 1. Проверяем существует ли пользователь в базе
  const existingUser = await getUserByTelegramId(ctx)
  console.log('subscriptionCheckStep - existingUser:', existingUser)

  if (!existingUser) {
    console.log(`CASE: User ${telegramId} not found, entering createUserScene`)
    return ctx.scene.enter('createUserScene')
  }

  // 2. Проверяем наличие активной платной подписки ('neurophoto' или 'neurobase')
  const paidSubscription = await checkActivePaymentSubscription(telegramId)
  console.log(
    `subscriptionCheckStep - User ${telegramId} paid subscription check:`,
    paidSubscription
  )

  // 3. Логика доступа
  if (paidSubscription.isActive) {
    // Пользователь с активной платной подпиской - пропускаем проверку канала
    console.log(
      `CASE: User ${telegramId} has active paid subscription (${paidSubscription.type}), skipping channel check`
    )
  } else {
    // У пользователя НЕТ активной платной подписки - проверяем обязательный канал
    console.log(
      `CASE: User ${telegramId} does NOT have active paid subscription`
    )
    const SUBSCRIBE_CHANNEL_ID = getSubScribeChannel(ctx)

    if (SUBSCRIBE_CHANNEL_ID) {
      console.log(
        `Checking mandatory channel subscription for user ${telegramId}, channel ${SUBSCRIBE_CHANNEL_ID}`
      )
      const isSubscribedToChannel = await verifySubscription(
        ctx,
        language_code?.toString() || 'ru',
        SUBSCRIBE_CHANNEL_ID
      )

      if (!isSubscribedToChannel) {
        // НЕ подписан на обязательный канал - выход
        console.log(
          `CASE: User ${telegramId} is NOT subscribed to required channel ${SUBSCRIBE_CHANNEL_ID}. Leaving scene.`
        )
        // Тут можно добавить сообщение пользователю перед выходом
        // await ctx.reply('Пожалуйста, подпишитесь на наш канал X для доступа...');
        return ctx.scene.leave()
      }
      console.log(
        `CASE: User ${telegramId} IS subscribed to required channel ${SUBSCRIBE_CHANNEL_ID}`
      )
    } else {
      // ID обязательного канала не настроен - пропускаем проверку
      // ВАЖНО: Если канал должен быть обязателен ВСЕГДА для НЕ платных юзеров,
      // то здесь нужно выходить из сцены ctx.scene.leave()
      console.log(
        'CASE: SUBSCRIBE_CHANNEL_ID not set, skipping mandatory channel check'
      )
    }
  }

  // 4. Переход к следующей сцене (если все проверки пройдены)
  if (ctx.session.mode === 'main_menu') {
    console.log(`User ${telegramId} passed checks, entering menuScene`)
    return ctx.scene.enter('menuScene')
  } else {
    console.log(`User ${telegramId} passed checks, entering startScene`)
    return ctx.scene.enter('startScene')
  }
}

export const subscriptionCheckScene = new WizardScene(
  'subscriptionCheckScene',
  subscriptionCheckStep
)
