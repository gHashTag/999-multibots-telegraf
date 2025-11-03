import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'

import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { PaymentType } from '@/interfaces/payments.interface'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'
import { handleSelectStars } from '@/handlers/handleSelectStars'
import { handleBuySubscription } from '@/handlers/handleBuySubscription'
import { starAmounts } from '@/price/helpers/starAmounts'

/**
 * Старая сцена оплаты, теперь используется как точка входа
 * для выбора типа оплаты (Звезды или Рубли).
 */
export const paymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.PaymentScene
)

paymentScene.enter(async ctx => {
  logger.info(`[${ModeEnum.PaymentScene}] Entering scene.`, {
    telegram_id: ctx.from?.id,
    botInfo: ctx.botInfo, // Логируем для отладки
    session_selectedPayment: ctx.session.selectedPayment, // Логируем, что в сессии
  })
  const isRu = isRussian(ctx)
  const showRublesButton = shouldShowRubles(ctx) // Используем хелпер

  try {
    const message = isRu ? 'Выберите способ оплаты:' : 'Select payment method:'

    const buttons = [
      [Markup.button.text(isRu ? '⭐️ Звездами' : '⭐️ Stars')], // Кнопка Звездами всегда есть
    ]

    // Добавляем кнопку Рублями только если хелпер разрешает
    if (showRublesButton) {
      buttons[0].push(Markup.button.text(isRu ? '💳 Рублями' : '💳 Rubles'))
    }

    // Добавляем остальные кнопки (Справка, Главное меню)
    buttons.push([
      Markup.button.webApp(
        isRu ? 'Что такое звезды❓' : 'What are stars❓',
        `https://telegram.org/blog/telegram-stars/${isRu ? 'ru' : 'en'}?ln=a`
      ),
    ])
    buttons.push([
      Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu'),
    ])

    const keyboard = Markup.keyboard(buttons).resize()

    await ctx.reply(message, { reply_markup: keyboard.reply_markup })
  } catch (error: any) {
    logger.error(`❌ [${ModeEnum.PaymentScene}] Error in enter:`, {
      error: error.message,
      stack: error.stack,
      telegram_id: ctx.from?.id,
    })
    await ctx.reply(isRu ? 'Произошла ошибка.' : 'An error occurred.')
    await ctx.scene.leave()
  }
})

// Переход в сцену оплаты Звездами
paymentScene.hears(['⭐️ Звездами', '⭐️ Stars'], async ctx => {
  const isRu = isRussian(ctx)
  const selectedPaymentInfo = ctx.session.selectedPayment

  // ----- >>> ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ СЕССИИ ПЕРЕД РЕШЕНИЕМ <<< -----
  logger.info(
    `[${ModeEnum.PaymentScene}] HEARS '⭐️ Звездами': Checking session BEFORE decision.`,
    {
      telegram_id: ctx.from?.id,
      session_dump: JSON.stringify(ctx.session, null, 2), // Выводим всю сессию
      extracted_selectedPaymentInfo: selectedPaymentInfo, // Выводим извлеченное значение
    }
  )
  // ----- >>> КОНЕЦ ДЕТАЛЬНОГО ЛОГИРОВАНИЯ <<< -----

  logger.info(
    `[${ModeEnum.PaymentScene}] User chose Stars. Session selectedPayment:`,
    { telegram_id: ctx.from?.id, selectedPaymentInfo }
  )

  // Проверяем, есть ли в сессии информация о выбранной ПОДПИСКЕ
  if (
    selectedPaymentInfo &&
    selectedPaymentInfo.type === PaymentType.MONEY_INCOME &&
    selectedPaymentInfo.subscription
  ) {
    logger.info(
      `[${ModeEnum.PaymentScene}] Detected SUBSCRIPTION purchase flow for stars. Calling handleBuySubscription.`,
      {
        telegram_id: ctx.from?.id,
        subscription: selectedPaymentInfo.subscription,
      }
    )
    // Это покупка конкретной подписки
    await handleBuySubscription({ ctx, isRu })
    // handleBuySubscription должен сам управлять выходом из сцены или дальнейшими шагами
  } else {
    logger.info(
      `[${ModeEnum.PaymentScene}] Detected BALANCE TOP-UP flow for stars. Calling handleSelectStars.`,
      { telegram_id: ctx.from?.id }
    )
    // Это пополнение баланса
    await handleSelectStars({ ctx, starAmounts, isRu })
    // НЕ ВХОДИМ НИ В КАКУЮ СЦЕНУ ЗДЕСЬ.
    // Обработка нажатия на кнопки 'top_up_X' произойдет через bot.action
    // и вызовет handleTopUp -> handleBuy, который отправит инвойс.
  }
})

// Переход в сцену оплаты Рублями
// Используем версию из origin/main (обработчик восстановлен)
paymentScene.hears(['💳 Рублями', '💳 Rubles'], async ctx => {
  logger.info(
    `[${ModeEnum.PaymentScene}] User chose Rubles. Entering RublePaymentScene.`,
    { telegram_id: ctx.from?.id }
  )
  const paymentInfo = ctx.session.selectedPayment
  if (
    paymentInfo &&
    paymentInfo.type === PaymentType.MONEY_INCOME &&
    paymentInfo.subscription
  ) {
    // Если это покупка подписки, передаем paymentInfo в rublePaymentScene
    // rublePaymentScene сама разберется, как выставить счет на конкретную сумму подписки
    logger.info(
      `[${ModeEnum.PaymentScene}] Passing selectedPayment to RublePaymentScene for subscription.`,
      { telegram_id: ctx.from?.id, paymentInfo }
    )
    await ctx.scene.enter(ModeEnum.RublePaymentScene, { paymentInfo })
  } else {
    // Иначе (пополнение баланса) просто входим в сцену для выбора суммы пополнения рублями
    logger.info(
      `[${ModeEnum.PaymentScene}] Entering RublePaymentScene for balance top-up.`,
      { telegram_id: ctx.from?.id }
    )
    await ctx.scene.enter(ModeEnum.RublePaymentScene)
  }
})

// Выход в главное меню
paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  logger.info(
    `[${ModeEnum.PaymentScene}] User chose Main Menu. Leaving scene.`,
    { telegram_id: ctx.from?.id }
  )
  // Очищаем информацию о выбранном платеже перед выходом
  ctx.session.selectedPayment = undefined
  logger.info(`[${ModeEnum.PaymentScene}] Cleared session.selectedPayment.`, {
    telegram_id: ctx.from?.id,
  })
  await ctx.scene.leave()
  return // Вызываем УДАЛЁН, чтобы показать главное меню
})

// Обработка непредвиденных сообщений
paymentScene.on('message', async ctx => {
  const isRu = isRussian(ctx)
  logger.warn(`[${ModeEnum.PaymentScene}] Received unexpected message`, {
    telegram_id: ctx.from?.id,
    text: (ctx.message as any)?.text,
  })

  // Предлагаем только доступные опции
  const replyText = isRu
    ? 'Пожалуйста, выберите ⭐️ Звездами или вернитесь в 🏠 Главное меню.'
    : 'Please select ⭐️ Stars or return to the 🏠 Main menu.'

  // Клавиатура только со Звездами и Меню
  const buttons = [
    [Markup.button.text(isRu ? '⭐️ Звездами' : '⭐️ Stars')],
    [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu')],
  ]
  const keyboard = Markup.keyboard(buttons).resize()

  await ctx.reply(replyText, { reply_markup: keyboard.reply_markup })
})

