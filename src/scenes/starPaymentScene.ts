import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleSelectStars, handleBuySubscription } from '@/handlers'
import { starAmounts } from '@/price/helpers/starAmounts' // Предполагаем, что существует
import { setPayments } from '@/core/supabase'
import { getBotNameByToken } from '@/core'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'

export const starPaymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.StarPaymentScene
)

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

// Обработка выбора пакета звезд
starPaymentScene.action(/top_up_(\d+)/, async ctx => {
  const isRu = isRussian(ctx)
  try {
    await ctx.answerCbQuery() // Отвечаем на колбэк
    const amount = parseInt(ctx.match[1], 10)
    logger.info(
      `[${ModeEnum.StarPaymentScene}] Processing callback top_up: ${amount} ⭐️`,
      {
        telegram_id: ctx.from?.id,
        amount: amount,
      }
    )

    const userId = ctx.from?.id
    if (!userId) {
      logger.error(`❌ [${ModeEnum.StarPaymentScene}] User ID is missing!`, {
        callback_data: ctx.match[0],
      })
      await ctx.reply(
        isRu
          ? 'Произошла ошибка: не удалось определить ваш аккаунт.'
          : 'An error occurred: could not identify your account.'
      )
      return ctx.scene.leave()
    }

    const { bot_name } = getBotNameByToken(ctx.telegram.token)

    // Сохраняем платеж в БД со статусом SUCCESS
    await setPayments({
      telegram_id: userId.toString(),
      OutSum: amount.toString(),
      InvId: Math.floor(Math.random() * 1000000).toString(), // Генерируем ID операции
      currency: 'STARS',
      stars: amount,
      status: 'SUCCESS',
      payment_method: 'TelegramStars',
      subscription: 'stars',
      bot_name,
      language: ctx.from?.language_code,
    })

    logger.info(
      `[${ModeEnum.StarPaymentScene}] SUCCESS payment saved for ${amount} stars`,
      {
        telegram_id: userId,
        amount: amount,
      }
    )

    // Отправляем подтверждение
    await ctx.reply(
      isRu
        ? `✅ <b>Оплата выполнена</b>\nСписано: ${amount} ⭐️\n\nБлагодарим за покупку! Звезды будут зачислены на ваш баланс.`
        : `✅ <b>Payment completed</b>\nDebited: ${amount} ⭐️\n\nThank you for your purchase! Stars will be credited to your balance.`,
      { parse_mode: 'HTML' }
    )
    logger.info(
      `[${ModeEnum.StarPaymentScene}] Star payment confirmation sent to user ${userId}`
    )
    return ctx.scene.leave() // Выходим после подтверждения
  } catch (error: any) {
    logger.error(
      `❌ [${ModeEnum.StarPaymentScene}] Error processing callback top_up:`,
      {
        error: error.message,
        stack: error.stack,
        telegram_id: ctx.from?.id,
        callback_data: ctx.match ? ctx.match[0] : 'N/A',
      }
    )
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при обработке платежа звездами.'
        : 'An error occurred while processing the star payment.'
    )
    return ctx.scene.leave()
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
