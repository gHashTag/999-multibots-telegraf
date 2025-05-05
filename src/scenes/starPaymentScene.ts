import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleSelectStars, handleBuySubscription } from '@/handlers'
import { starAmounts } from '@/price/helpers/starAmounts' // Предполагаем, что существует
import { setPayments } from '@/core/supabase'
import { getBotNameByToken } from '@/core'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { handleTopUp } from '@/handlers/paymentHandlers/handleTopUp'

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
  const isRu = isRussian(ctx)

  // Проверяем, пришли ли мы сюда для покупки КОНКРЕТНОЙ подписки
  if (ctx.session.selectedPayment && ctx.session.selectedPayment.subscription) {
    const subscriptionToBuy = ctx.session.selectedPayment.subscription
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

// Выход из сцены
starPaymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  logger.info(
    `[${ModeEnum.StarPaymentScene}] Leaving scene via Main Menu button`,
    {
      telegram_id: ctx.from?.id,
    }
  )
  await ctx.scene.enter(ModeEnum.MainMenu)
})

// Action handler for star top-up buttons
starPaymentScene.action(/top_up_(\d+)/, handleTopUp)
