import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleSelectStars, handleBuySubscription } from '@/handlers'
import { starAmounts } from '@/price/helpers/starAmounts' // Предполагаем, что существует
import { setPayments } from '@/core/supabase/payments/setPayments'
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
  const subscription = ctx.session.subscription?.toLowerCase()

  // Если в сессии есть конкретная подписка (не 'stars'), предлагаем купить ее за звезды
  if (
    subscription &&
    subscription !== 'stars' &&
    [
      'neurobase',
      'neuromeeting',
      'neuroblogger',
      'neurophoto',
      'neuromentor',
    ].includes(subscription)
  ) {
    logger.info(
      `[${ModeEnum.StarPaymentScene}] Offering subscription buy with stars: ${subscription}`,
      {
        telegram_id: ctx.from?.id,
      }
    )
    // Используем хендлер для покупки подписки
    await handleBuySubscription({ ctx, isRu })
    // Этот хендлер должен сам позаботиться о выходе из сцены или переходе дальше
  } else {
    logger.info(
      `[${ModeEnum.StarPaymentScene}] Offering star package selection`,
      {
        telegram_id: ctx.from?.id,
      }
    )
    // Иначе, предлагаем выбор пакета звезд
    // Используем существующий хендлер для отображения кнопок
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

// Обработка любых других сообщений
starPaymentScene.on('message', async ctx => {
  const isRu = isRussian(ctx)
  logger.warn(`[${ModeEnum.StarPaymentScene}] Received unexpected message`, {
    telegram_id: ctx.from?.id,
    // @ts-ignore
    message_text: ctx.message?.text,
  })
  await ctx.reply(
    isRu
      ? 'Пожалуйста, выберите пакет звезд или вернитесь в главное меню.'
      : 'Please select a star package or return to the main menu.'
  )
  // Не выходим из сцены
})
