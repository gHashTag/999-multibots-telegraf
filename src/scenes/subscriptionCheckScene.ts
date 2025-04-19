import { MyContext } from '@/interfaces'
import { WizardScene } from 'telegraf/scenes'
import { getUserByTelegramId } from '@/core/supabase'
// Используем финальную функцию проверки подписки по типу в payments_v2
import { checkActivePaymentSubscription } from '@/core/supabase/checkSubscriptionByTelegramId'
import { verifySubscription } from '@/middlewares/verifySubscription'
import { getSubScribeChannel } from '@/handlers'
import { logger } from '@/utils/logger'

const subscriptionCheckStep = async (ctx: MyContext) => {
  const telegramId = ctx.from?.id
  logger.info('⚙️ CASE: subscriptionCheckScene started', {
    telegram_id: telegramId,
    username: ctx.from?.username,
  })

  if (!telegramId) {
    logger.error('❌ Не удалось получить telegramId в subscriptionCheckScene')
    return ctx.scene.leave() // Выходим, если нет ID
  }

  // ---> УДАЛЕНА ПРОВЕРКА НА АДМИНА/ТЕСТЕРА <---
  // Теперь все пользователи проходят стандартные проверки

  // --- Обычная логика для всех пользователей ---
  logger.info('👤 Выполняем стандартные проверки для пользователя', {
    telegram_id: telegramId,
  })

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

  // 3. Логика доступа: ЕСЛИ ЕСТЬ АКТИВНАЯ ПЛАТНАЯ ПОДПИСКА -> ДОСТУП
  if (paidSubscription.isActive) {
    console.log(
      `CASE: User ${telegramId} has active paid subscription (${paidSubscription.type}), entering next scene`
    )
    // --- Пользователь с активной платной подпиской ---
    // Дополнительно можно проверить канал, если это нужно даже для платных,
    // но скорее всего, платные юзеры уже имеют полный доступ.
    // Оставляем текущую логику перехода в menu/start сцену.
    const nextScene =
      ctx.session.mode === 'main_menu' ? 'menuScene' : 'startScene'
    console.log(`User ${telegramId} passed checks, entering ${nextScene}`)
    return ctx.scene.enter(nextScene)
  } else {
    // --- У пользователя НЕТ активной платной подписки ---
    console.log(
      `CASE: User ${telegramId} does NOT have active paid subscription. Entering subscriptionScene.`
    )
    // СРАЗУ отправляем пользователя в сцену покупки подписки.
    // Перевірка обов'язкового каналу більше не впливає на доступ до платного меню.
    return ctx.scene.enter('subscriptionScene')

    // --- Стара логіка з перевіркою каналу (ЗАКОМЕНТОВАНА) ---
    /*
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
      console.log(
        'CASE: SUBSCRIBE_CHANNEL_ID not set, skipping mandatory channel check'
      )
    }
    // Неплатний користувач пройшов перевірку каналу (або її не було) - все одно переходимо до меню? НІ!
    // Переход к следующей сцене (если все проверки пройдены)
    if (ctx.session.mode === 'main_menu') {
      console.log(`User ${telegramId} passed checks, entering menuScene`) // ПОМИЛКА ЛОГІКИ
      return ctx.scene.enter('menuScene')
    } else {
      console.log(`User ${telegramId} passed checks, entering startScene`) // ПОМИЛКА ЛОГІКИ
      return ctx.scene.enter('startScene')
    }
    */
  }
}

export const subscriptionCheckScene = new WizardScene(
  'subscriptionCheckScene',
  subscriptionCheckStep
)
