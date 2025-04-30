import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'

import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { PaymentType } from '@/interfaces/payments.interface'
import { shouldShowRubles } from '@/core/bot/shouldShowRubles'

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
    session_subscription: ctx.session.subscription,
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
  logger.info(
    `[${ModeEnum.PaymentScene}] User chose Stars. Entering StarPaymentScene.`,
    { telegram_id: ctx.from?.id }
  )
  // Определяем, это подписка или пополнение (логика может быть сложнее)
  const intentType = ctx.session.selectedPayment?.type
  const paymentInfo = ctx.session.selectedPayment
  if (intentType === PaymentType.MONEY_INCOME && paymentInfo) {
    await ctx.scene.enter(ModeEnum.StarPaymentScene, { paymentInfo })
  } else {
    await ctx.scene.enter(ModeEnum.StarPaymentScene)
  }
})

// Переход в сцену оплаты Рублями
// Обработчик "Рублями" - ПОЛНОСТЬЮ УДАЛЕН
// paymentScene.hears(['💳 Рублями', '💳 Rubles'], async ctx => { ... });

// Выход в главное меню
paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  logger.info(`[${ModeEnum.PaymentScene}] Leaving scene via Main Menu button`, {
    telegram_id: ctx.from?.id,
  })
  await ctx.scene.enter(ModeEnum.MainMenu)
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

export default paymentScene
