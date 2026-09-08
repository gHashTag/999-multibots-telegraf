import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { handleSelectStars, handleBuySubscription } from '@/handlers'
import { starAmounts } from '@/price/helpers/starAmounts' // Предполагаем, что существует
import { setPayments } from '@/core/supabase'
import { getBotNameByToken } from '@/core'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { handleTopUp } from '@/handlers/paymentHandlers/handleTopUp'
import { getMainMenuText } from '@/navigation'

export const starPaymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.StarPaymentScene
)
//
// Вход в сцену: Показываем варианты покупки звезд или опцию покупки подписки
starPaymentScene.enter(async ctx => {
  logger.info('### starPaymentScene ENTERED ###', {
    scene: ModeEnum.StarPaymentScene,
    step: 'enter',
    telegram_id: ctx.from?.id,
  })
  const isRu = isRussianFromState(ctx)

  // Проверяем, пришли ли мы сюда для покупки КОНКРЕТНОЙ подписки
  // A plan is chosen only when it carries a positive star amount. The default
  // session ships selectedPayment as { stars: 0, subscription: 'STARS' }, so
  // testing the subscription field alone sent every fresh session (right after
  // /start) into handleBuySubscription with 0 stars: the person pressed
  // "top up" and read "invalid star amount" instead of the star packages
  // (owner, 08.09.2026 18:46Z, three times in a row).
  const chosen = ctx.session.selectedPayment
  const hasPaidPlan =
    !!chosen && !!chosen.subscription && Number(chosen.stars) > 0
  if (hasPaidPlan && chosen) {
    const subscriptionToBuy = chosen.subscription
    logger.info(
      `[${ModeEnum.StarPaymentScene}] Entered scene to buy subscription: ${subscriptionToBuy}`,
      {
        telegram_id: ctx.from?.id,
        selectedPayment: ctx.session.selectedPayment,
      }
    )
    // Напрямую вызываем логику покупки подписки
    // Передаем контекст и язык, handleBuySubscription возьмет детали из сессии
    await handleBuySubscription({ ctx, isRu })
    // handleBuySubscription должен сам выйти из сцены или обработать дальнейшие шаги
  } else {
    // Если информации о подписке нет, значит, пользователь хочет пополнить баланс
    logger.info(
      `[${ModeEnum.StarPaymentScene}] Entered scene for star top-up. Offering package selection.`,
      {
        telegram_id: ctx.from?.id,
      }
    )
    // Предлагаем выбор пакета звезд
    await handleSelectStars({ ctx, isRu, starAmounts })
  }
})

// ✅ Переключение на оплату рублями (если пользователь передумал)
starPaymentScene.hears(['💳 Рублями', '💳 Rubles'], async ctx => {
  logger.info(
    `[${ModeEnum.StarPaymentScene}] User wants to switch to Rubles payment`,
    {
      telegram_id: ctx.from?.id,
    }
  )
  await ctx.scene.enter(ModeEnum.RublePaymentScene)
})

// Выход из сцены
starPaymentScene.hears(/^🏠/, async ctx => {
  const isRu = isRussianFromState(ctx)
  const mainMenuText = getMainMenuText(isRu)

  if (
    ctx.message &&
    'text' in ctx.message &&
    ctx.message.text === mainMenuText
  ) {
    logger.info(
      `[${ModeEnum.StarPaymentScene}] Leaving scene via Main Menu button`,
      {
        telegram_id: ctx.from?.id,
      }
    )
    await ctx.scene.leave()
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
  }
})

// Action handler for star top-up buttons
starPaymentScene.action(/top_up_(\d+)/, handleTopUp)
