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
import { getMainMenuText } from '@/navigation'
import { canX402Credit } from '@/core/x402'
import { TON_PAYMENT_SCENE_ID } from '@/scenes/tonPaymentScene'
import { TON_NATIVE_PAYMENT_SCENE_ID } from '@/scenes/tonNativePaymentScene'

/**
 * Старая сцена оплаты, теперь используется как точка входа
 * для выбора типа оплаты (Звезды или Рубли).
 */
export const paymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.PaymentScene
)

paymentScene.enter(async ctx => {
  logger.info(
    `🔍 [PAYMENT DEBUG] [${ModeEnum.PaymentScene}] ===== ENTER HANDLER CALLED =====`,
    {
      telegram_id: ctx.from?.id,
      timestamp: new Date().toISOString(),
      botInfo: ctx.botInfo, // Логируем для отладки
      session_selectedPayment: ctx.session.selectedPayment, // Логируем, что в сессии
      sceneId: ctx.scene?.current?.id,
      hasScene: !!ctx.scene?.current,
      sceneCurrent: ctx.scene?.current,
    }
  )
  const isRu = isRussian(ctx)
  const showRublesButton = shouldShowRubles(ctx) // Используем хелпер

  logger.info(
    `[${ModeEnum.PaymentScene}] Enter scene - showRublesButton: ${showRublesButton}`,
    {
      telegram_id: ctx.from?.id,
      botInfo: ctx.botInfo,
      showRublesButton,
    }
  )

  try {
    const message = isRu ? 'Выберите способ оплаты:' : 'Select payment method:'

    // Первая строка: все способы оплаты в одну линию
    const paymentRow = [Markup.button.text(isRu ? '⭐ Звездами' : '⭐ Stars')]

    // Добавляем единую кнопку Криптой (показывает inline-меню с выбором)
    // Показываем всегда - есть TON USDT и TON даже без x402
    paymentRow.push(Markup.button.text(isRu ? '💎 Криптой' : '💎 Crypto'))
    logger.info(`[${ModeEnum.PaymentScene}] Added Crypto button to keyboard`, {
      telegram_id: ctx.from?.id,
    })

    // Добавляем кнопку Рублями только если хелпер разрешает
    if (showRublesButton) {
      paymentRow.push(Markup.button.text(isRu ? '💳 Рублями' : '💳 Rubles'))
      logger.info(
        `[${ModeEnum.PaymentScene}] Added Rubles button to keyboard`,
        {
          telegram_id: ctx.from?.id,
        }
      )
    } else {
      logger.warn(
        `[${ModeEnum.PaymentScene}] Rubles button NOT added (showRublesButton=false)`,
        {
          telegram_id: ctx.from?.id,
          botInfo: ctx.botInfo,
        }
      )
    }

    const buttons = [
      paymentRow, // [⭐ Звездами] [💎 Криптой] [💳 Рублями]
      [
        Markup.button.webApp(
          isRu ? 'Что такое звезды❓' : 'What are stars❓',
          `https://telegram.org/blog/telegram-stars/${isRu ? 'ru' : 'en'}?ln=a`
        ),
      ],
      [Markup.button.text(getMainMenuText(isRu))],
    ]

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
paymentScene.hears(
  ['⭐️ Звездами', '⭐️ Stars', '⭐ Звездами', '⭐ Stars'],
  async ctx => {
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
  }
)

// Переход в сцену оплаты Рублями
// Используем версию из origin/main (обработчик восстановлен)
paymentScene.hears(['💳 Рублями', '💳 Rubles'], async ctx => {
  logger.info(
    `🔍 [PAYMENT DEBUG] [${ModeEnum.PaymentScene}] ===== HEARS HANDLER TRIGGERED: User chose Rubles =====`,
    {
      telegram_id: ctx.from?.id,
      timestamp: new Date().toISOString(),
      currentScene: ctx.scene?.current?.id,
      sceneId: ctx.scene?.current?.id,
      sceneCurrent: ctx.scene?.current,
      hasScene: !!ctx.scene?.current,
      sessionSelectedPayment: ctx.session.selectedPayment,
      messageText:
        ctx.message && 'text' in ctx.message ? ctx.message.text : 'N/A',
      messageType: ctx.message ? Object.keys(ctx.message) : 'no_message',
    }
  )

  // ✅ КРИТИЧЕСКАЯ ПРОВЕРКА: Убеждаемся, что пользователь находится в PaymentScene
  if (ctx.scene?.current?.id !== ModeEnum.PaymentScene) {
    logger.error(
      `❌ [PAYMENT DEBUG] [${ModeEnum.PaymentScene}] HEARS HANDLER: User is NOT in PaymentScene!`,
      {
        telegram_id: ctx.from?.id,
        expectedScene: ModeEnum.PaymentScene,
        actualScene: ctx.scene?.current?.id,
        sceneCurrent: ctx.scene?.current,
      }
    )
    const isRu = isRussian(ctx)
    await ctx.reply(
      isRu
        ? '❌ Ошибка: вы не находитесь в сцене оплаты. Попробуйте начать заново.'
        : '❌ Error: you are not in the payment scene. Please try again.'
    )
    await ctx.scene.leave()
    return
  }

  logger.info(
    `[${ModeEnum.PaymentScene}] User chose Rubles. Entering RublePaymentScene.`,
    {
      telegram_id: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
      sessionSelectedPayment: ctx.session.selectedPayment,
    }
  )

  try {
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
        {
          telegram_id: ctx.from?.id,
          hasPaymentInfo: !!paymentInfo,
          paymentInfoType: paymentInfo?.type,
          paymentInfoSubscription: paymentInfo?.subscription,
        }
      )
      await ctx.scene.enter(ModeEnum.RublePaymentScene)
    }
  } catch (error: any) {
    logger.error(
      `❌ [${ModeEnum.PaymentScene}] Error entering RublePaymentScene:`,
      {
        error: error.message,
        stack: error.stack,
        telegram_id: ctx.from?.id,
      }
    )
    const isRu = isRussian(ctx)
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при переходе к оплате рублями. Попробуйте позже.'
        : '❌ An error occurred while switching to ruble payment. Please try again later.'
    )
  }
})

// Переход к выбору криптовалюты (показываем inline-меню)
paymentScene.hears(['💎 Криптой', '💎 Crypto'], async ctx => {
  const isRu = isRussian(ctx)
  // Not `isX402Configured`: a configured wallet does not mean a payment made
  // this way can be credited. Settlement verification does not exist, so
  // offering this button collected twelve payments and credited none of them.
  const showX402 = canX402Credit()

  logger.info(
    `[${ModeEnum.PaymentScene}] User chose Crypto. Showing crypto selection menu.`,
    {
      telegram_id: ctx.from?.id,
      currentScene: ctx.scene?.current?.id,
      showX402,
    }
  )

  try {
    const message = isRu
      ? '💎 *Выберите криптовалюту для оплаты:*'
      : '💎 *Select cryptocurrency for payment:*'

    // Формируем кнопки в зависимости от доступных методов
    const cryptoButtons = []

    // Всегда показываем TON USDT (стейблкоин на TON)
    cryptoButtons.push([
      Markup.button.callback(
        isRu ? '💠 TON USDT (стейблкоин)' : '💠 TON USDT (stablecoin)',
        'crypto_select_ton_usdt'
      ),
    ])

    // Всегда показываем нативный TON
    cryptoButtons.push([
      Markup.button.callback(
        isRu ? '💎 TON (нативный)' : '💎 TON (native)',
        'crypto_select_ton_native'
      ),
    ])

    // Добавляем USDC Base если x402 настроен
    if (showX402) {
      cryptoButtons.push([
        Markup.button.callback(
          isRu ? '🔵 USDC (Base)' : '🔵 USDC (Base)',
          'crypto_select_usdc_base'
        ),
      ])
    }

    // Кнопка назад
    cryptoButtons.push([
      Markup.button.callback(isRu ? '◀️ Назад' : '◀️ Back', 'crypto_back'),
    ])

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(cryptoButtons),
    })
  } catch (error: any) {
    logger.error(`❌ [${ModeEnum.PaymentScene}] Error showing crypto menu:`, {
      error: error.message,
      stack: error.stack,
      telegram_id: ctx.from?.id,
    })
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка. Попробуйте позже.'
        : '❌ An error occurred. Please try again later.'
    )
  }
})

// Action: Выбор TON USDT
paymentScene.action('crypto_select_ton_usdt', async ctx => {
  await ctx.answerCbQuery()
  logger.info(`[${ModeEnum.PaymentScene}] User selected TON USDT`, {
    telegram_id: ctx.from?.id,
  })
  try {
    await ctx.deleteMessage()
  } catch {
    // ignore
  }
  await ctx.scene.enter(TON_PAYMENT_SCENE_ID)
})

// Action: Выбор нативного TON
paymentScene.action('crypto_select_ton_native', async ctx => {
  await ctx.answerCbQuery()
  logger.info(`[${ModeEnum.PaymentScene}] User selected TON native`, {
    telegram_id: ctx.from?.id,
  })
  try {
    await ctx.deleteMessage()
  } catch {
    // ignore
  }
  await ctx.scene.enter(TON_NATIVE_PAYMENT_SCENE_ID)
})

// Action: Выбор USDC Base
paymentScene.action('crypto_select_usdc_base', async ctx => {
  await ctx.answerCbQuery()
  logger.info(`[${ModeEnum.PaymentScene}] User selected USDC Base`, {
    telegram_id: ctx.from?.id,
  })
  try {
    await ctx.deleteMessage()
  } catch {
    // ignore
  }
  await ctx.scene.enter(ModeEnum.CryptoPaymentScene)
})

// Action: Назад из крипто-меню
paymentScene.action('crypto_back', async ctx => {
  await ctx.answerCbQuery()
  try {
    await ctx.deleteMessage()
  } catch {
    // ignore
  }
  // Re-enter payment scene to show main payment menu
  await ctx.scene.reenter()
})

// УДАЛЕНО: Старые hears обработчики для TON USDT и TON
// Теперь выбор происходит через inline-кнопки в меню "Криптой"

// Выход в главное меню
paymentScene.hears(/^🏠/, async ctx => {
  const isRu = isRussian(ctx)
  const mainMenuText = getMainMenuText(isRu)

  if (
    ctx.message &&
    'text' in ctx.message &&
    ctx.message.text === mainMenuText
  ) {
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
    // ✅ ИСПРАВЛЕНО: Показываем главное меню после выхода из сцены
    const { showMainMenu } = await import('@/navigation')
    await showMainMenu(ctx)
  }
})

// Обработка непредвиденных сообщений
paymentScene.on('message', async ctx => {
  const messageText = (ctx.message as any)?.text
  const isRu = isRussian(ctx)

  // ✅ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем кнопки меню
  try {
    const { ALL_BUTTONS } = await import('@/navigation/config/buttons.config')
    const button = Object.values(ALL_BUTTONS).find(
      btn => btn.ru === messageText || btn.en === messageText
    )

    if (button) {
      // Это кнопка меню! Выходим из сцены и позволяем глобальному обработчику её обработать
      logger.info('🔄 [paymentScene] Menu button detected, exiting scene', {
        telegramId: ctx.from?.id,
        buttonText: messageText,
      })
      ctx.session.selectedPayment = undefined
      return ctx.scene.leave()
    }
  } catch (error) {
    // Если не удалось импортировать, продолжаем с обычной обработкой
    logger.warn('⚠️ [paymentScene] Failed to import buttons config', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: ctx.from?.id,
    })
  }

  logger.warn(`[${ModeEnum.PaymentScene}] Received unexpected message`, {
    telegram_id: ctx.from?.id,
    text: messageText,
  })

  // Предлагаем только доступные опции
  const mainMenuText = getMainMenuText(isRu)
  const replyText = isRu
    ? `Пожалуйста, выберите ⭐️ Звездами или вернитесь в ${mainMenuText}.`
    : `Please select ⭐️ Stars or return to the ${mainMenuText}.`

  // Клавиатура только со Звездами и Меню
  const buttons = [
    [Markup.button.text(isRu ? '⭐️ Звездами' : '⭐️ Stars')],
    [Markup.button.text(mainMenuText)],
  ]
  const keyboard = Markup.keyboard(buttons).resize()

  await ctx.reply(replyText, { reply_markup: keyboard.reply_markup })
})

export default paymentScene
