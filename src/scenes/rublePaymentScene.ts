import { Markup, Scenes } from 'telegraf'
import { MyContext, SessionData, SelectedPayment } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleSelectRubAmount } from '@/handlers'
import { rubTopUpOptions } from '@/price/helpers/rubTopUpOptions'
import { getInvoiceId } from '@/scenes/getRuBillWizard/helper'
import { MERCHANT_LOGIN, ROBOKASSA_PASSWORD_1 } from '@/config'
import { setPayments } from '@/core/supabase'
import { getBotNameByToken } from '@/core'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'

import {
  PaymentStatus,
  Currency,
  PaymentType,
} from '@/interfaces/payments.interface'

export const rublePaymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.RublePaymentScene
)

// Вход в сцену: Показываем варианты пополнения ИЛИ счет на оплату подписки
rublePaymentScene.enter(async ctx => {
  const sceneState = ctx.scene.state as { paymentInfo?: SelectedPayment }
  const paymentInfo = sceneState?.paymentInfo
  const isRu = isRussian(ctx)
  const userId = ctx.from?.id

  logger.info('### rublePaymentScene ENTERED ###', {
    scene: ModeEnum.RublePaymentScene,
    step: 'enter',
    telegram_id: userId,
    sceneState: ctx.scene.state,
  })

  if (!userId) {
    logger.error(
      `❌ [${ModeEnum.RublePaymentScene}] User ID is missing on enter!`,
      {
        sceneState: ctx.scene.state,
      }
    )
    await ctx.reply(
      isRu
        ? 'Произошла ошибка: не удалось определить ваш аккаунт.'
        : 'An error occurred: could not identify your account.'
    )
    return ctx.scene.leave()
  }

  if (paymentInfo) {
    const amountRub = paymentInfo.amount
    const subscriptionType = paymentInfo.subscription
    const stars = paymentInfo.stars

    if (!amountRub || !subscriptionType || !stars) {
      logger.error(
        `❌ [${ModeEnum.RublePaymentScene}] Invalid paymentInfo in scene state for subscription`,
        {
          telegram_id: userId,
          paymentInfo: paymentInfo,
        }
      )
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при обработке данных подписки.'
          : 'An error occurred while processing subscription data.'
      )
      return ctx.scene.leave()
    }

    logger.info(
      `[${ModeEnum.RublePaymentScene}] Entered for SUBSCRIPTION payment: ${subscriptionType}`,
      {
        telegram_id: userId,
        amount: amountRub,
        stars: stars,
        subscription: subscriptionType,
      }
    )

    const invId = Math.floor(Math.random() * 1000000)
    const description = isRu
      ? `Оплата подписки ${subscriptionType}`
      : `Subscription payment for ${subscriptionType}`

    try {
      logger.info(
        `[${ModeEnum.RublePaymentScene}] Generating Robokassa URL for SUBSCRIPTION ${subscriptionType} (${amountRub} RUB)`,
        {
          telegram_id: userId,
          amount: amountRub,
          subscription: subscriptionType,
          invId: invId,
        }
      )

      const invoiceURL = await getInvoiceId(
        MERCHANT_LOGIN,
        amountRub,
        invId,
        description,
        ROBOKASSA_PASSWORD_1
      )

      const { bot_name } = getBotNameByToken(ctx.telegram.token)

      await setPayments({
        telegram_id: userId.toString(),
        OutSum: amountRub.toString(),
        InvId: invId.toString(),
        currency: Currency.RUB,
        stars: stars,
        status: PaymentStatus.PENDING,
        payment_method: 'Robokassa',
        type: PaymentType.MONEY_INCOME,
        subscription_type: subscriptionType,
        bot_name,
        language: ctx.from?.language_code ?? 'en',
      })

      logger.info(
        `[${ModeEnum.RublePaymentScene}] PENDING SUBSCRIPTION payment saved for InvId: ${invId}, Sub: ${subscriptionType}`,
        {
          telegram_id: userId,
          invId: invId,
        }
      )

      const inlineKeyboard = [
        [
          {
            text: isRu
              ? `Оплатить подписку ${amountRub} ₽`
              : `Pay subscription ${amountRub} RUB`,
            url: invoiceURL,
          },
        ],
      ]

      // Добавляем админскую тестовую кнопку "1 рубль" для подписок
      // НО только если мы НЕ пришли сюда уже через админский тест
      const { ADMIN_IDS_ARRAY } = await import('@/config')
      if (
        userId &&
        ADMIN_IDS_ARRAY.includes(userId) &&
        !ctx.session.isAdminTest
      ) {
        inlineKeyboard.push([
          {
            text: isRu
              ? '🧪 1 ₽ (Админ-тест подписки)'
              : '🧪 1 RUB (Admin Test Subscription)',
            callback_data: `test_subscription_1rub:${subscriptionType}:${stars}`,
          },
        ])
      }

      await ctx.reply(
        isRu
          ? `✅ <b>Счет на оплату подписки ${subscriptionType} создан</b>\nСумма: ${amountRub} ₽\n\nНажмите кнопку ниже для перехода к оплате через Robokassa.`
          : `✅ <b>Invoice created for subscription ${subscriptionType}</b>\nAmount: ${amountRub} RUB\n\nClick the button below to proceed with payment via Robokassa.`,
        {
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
          parse_mode: 'HTML',
        }
      )
      logger.info(
        `[${ModeEnum.RublePaymentScene}] Robokassa SUBSCRIPTION invoice message sent to user ${userId}`
      )
    } catch (error: any) {
      logger.error(
        `❌ [${ModeEnum.RublePaymentScene}] Error generating Robokassa URL for SUBSCRIPTION:`,
        {
          error: error.message,
          stack: error.stack,
          telegram_id: userId,
          paymentInfo: paymentInfo,
        }
      )
      await ctx.reply(
        isRu
          ? 'Произошла ошибка при создании счета на оплату подписки.'
          : 'An error occurred while creating the subscription invoice.'
      )
      return ctx.scene.leave()
    }
  } else {
    logger.info(`[${ModeEnum.RublePaymentScene}] Entered for BALANCE top-up`, {
      telegram_id: userId,
    })
    await handleSelectRubAmount({ ctx, isRu })
  }
})

// Обработка выбора суммы (ТОЛЬКО для пополнения баланса)
rublePaymentScene.action(/top_up_rub_(\d+)/, async ctx => {
  const sceneState = ctx.scene.state as { paymentInfo?: SelectedPayment }
  const paymentInfo = sceneState?.paymentInfo
  if (paymentInfo) {
    logger.warn(
      `[${ModeEnum.RublePaymentScene}] Action top_up_rub called, but scene state has paymentInfo (subscription payment). Ignoring callback.`,
      {
        telegram_id: ctx.from?.id,
        callback_data: ctx.match ? ctx.match[0] : 'N/A',
        sceneState: ctx.scene.state,
      }
    )
    await ctx.answerCbQuery()
    return
  }

  const isRu = isRussian(ctx)
  try {
    await ctx.answerCbQuery()
    const amountRub = parseInt(ctx.match[1], 10)
    logger.info(
      `[${ModeEnum.RublePaymentScene}] Processing callback top_up_rub: ${amountRub} ₽`,
      {
        telegram_id: ctx.from?.id,
        amount: amountRub,
      }
    )

    // Специальная обработка для админской тестовой кнопки "1 рубль"
    let selectedOption = rubTopUpOptions.find(o => o.amountRub === amountRub)

    // Если это админский тест на 1 рубль, создаем специальный объект
    if (!selectedOption && amountRub === 1) {
      const userId = ctx.from?.id
      const { ADMIN_IDS_ARRAY } = await import('@/config')

      if (userId && ADMIN_IDS_ARRAY.includes(userId)) {
        logger.info(
          `[${ModeEnum.RublePaymentScene}] Admin test payment: 1 RUB`,
          {
            telegram_id: userId,
            isAdmin: true,
          }
        )
        selectedOption = { amountRub: 1, stars: 1 } // Админский тест: 1 рубль = 1 звезда
      }
    }

    if (!selectedOption) {
      logger.error(
        `❌ [${ModeEnum.RublePaymentScene}] Invalid top-up option selected: ${amountRub} RUB`,
        {
          telegram_id: ctx.from?.id,
          amount: amountRub,
        }
      )
      await ctx.reply(
        isRu
          ? 'Произошла ошибка: неверная сумма пополнения.'
          : 'An error occurred: invalid top-up amount.'
      )
      return ctx.scene.leave()
    }

    const stars = selectedOption.stars
    const userId = ctx.from?.id
    if (!userId) {
      logger.error(`❌ [${ModeEnum.RublePaymentScene}] User ID is missing!`, {
        callback_data: ctx.match[0],
      })
      await ctx.reply(
        isRu
          ? 'Произошла ошибка: не удалось определить ваш аккаунт.'
          : 'An error occurred: could not identify your account.'
      )
      return ctx.scene.leave()
    }

    const invId = Math.floor(Math.random() * 1000000)
    const description = isRu
      ? `Пополнение баланса на ${stars} звезд${amountRub === 1 ? ' (Админ-тест)' : ''}`
      : `Balance top-up for ${stars} stars${amountRub === 1 ? ' (Admin Test)' : ''}`

    logger.info(
      `[${ModeEnum.RublePaymentScene}] Generating Robokassa URL for ${amountRub} RUB (${stars} stars)${amountRub === 1 ? ' [ADMIN TEST]' : ''}`,
      {
        telegram_id: userId,
        amount: amountRub,
        stars: stars,
        invId: invId,
        isAdminTest: amountRub === 1,
      }
    )

    const invoiceURL = await getInvoiceId(
      MERCHANT_LOGIN,
      amountRub,
      invId,
      description,
      ROBOKASSA_PASSWORD_1
    )

    const { bot_name } = getBotNameByToken(ctx.telegram.token)

    await setPayments({
      telegram_id: userId.toString(),
      OutSum: amountRub.toString(),
      InvId: invId.toString(),
      currency: Currency.RUB,
      stars: stars,
      status: PaymentStatus.PENDING,
      payment_method: 'Robokassa',
      type: PaymentType.MONEY_INCOME,
      subscription_type: null,
      bot_name,
      language: ctx.from?.language_code ?? 'en',
    })

    logger.info(
      `[${ModeEnum.RublePaymentScene}] PENDING BALANCE top-up payment saved for InvId: ${invId}${amountRub === 1 ? ' [ADMIN TEST]' : ''}`,
      {
        telegram_id: userId,
        invId: invId,
        isAdminTest: amountRub === 1,
      }
    )

    const inlineKeyboard = [
      [
        {
          text: isRu
            ? `Оплатить ${amountRub} ₽${amountRub === 1 ? ' (Тест)' : ''}`
            : `Pay ${amountRub} RUB${amountRub === 1 ? ' (Test)' : ''}`,
          url: invoiceURL,
        },
      ],
    ]

    await ctx.reply(
      isRu
        ? `✅ <b>Счет создан${amountRub === 1 ? ' (Админ-тест)' : ''}</b>\nСумма: ${amountRub} ₽ (${stars} ⭐️)\n\nНажмите кнопку ниже для перехода к оплате через Robokassa.`
        : `✅ <b>Invoice created${amountRub === 1 ? ' (Admin Test)' : ''}</b>\nAmount: ${amountRub} RUB (${stars} ⭐️)\n\nClick the button below to proceed with payment via Robokassa.`,
      {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
        parse_mode: 'HTML',
      }
    )
    logger.info(
      `[${ModeEnum.RublePaymentScene}] Robokassa invoice message sent to user ${userId}${amountRub === 1 ? ' [ADMIN TEST]' : ''}`
    )
  } catch (error: any) {
    logger.error(
      `❌ [${ModeEnum.RublePaymentScene}] Error processing callback top_up_rub:`,
      {
        error: error.message,
        stack: error.stack,
        telegram_id: ctx.from?.id,
        callback_data: ctx.match ? ctx.match[0] : 'N/A',
      }
    )
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при создании счета Robokassa.'
        : 'An error occurred while creating the Robokassa invoice.'
    )
    return ctx.scene.leave()
  }
})

// Обработка админской тестовой кнопки "1 рубль" для подписок
rublePaymentScene.action(/test_subscription_1rub:(.+):(\d+)/, async ctx => {
  const isRu = isRussian(ctx)
  const userId = ctx.from?.id

  if (!userId) {
    await ctx.answerCbQuery()
    return
  }

  // Проверяем права админа
  const { ADMIN_IDS_ARRAY } = await import('@/config')
  if (!ADMIN_IDS_ARRAY.includes(userId)) {
    await ctx.answerCbQuery(
      isRu
        ? 'У вас нет прав для этого действия'
        : 'You do not have permission for this action'
    )
    return
  }

  try {
    await ctx.answerCbQuery()

    const subscriptionType = ctx.match[1]
    const originalStars = parseInt(ctx.match[2], 10)
    const testAmount = 1 // 1 рубль для теста
    const testStars = 1 // 1 звезда для теста

    logger.info(
      `[${ModeEnum.RublePaymentScene}] Admin test subscription payment: 1 RUB for ${subscriptionType}`,
      {
        telegram_id: userId,
        subscription: subscriptionType,
        originalStars: originalStars,
        testAmount: testAmount,
        testStars: testStars,
        isAdmin: true,
      }
    )

    const invId = Math.floor(Math.random() * 1000000)
    const description = isRu
      ? `Тест подписки ${subscriptionType} (Админ)`
      : `Test subscription ${subscriptionType} (Admin)`

    const invoiceURL = await getInvoiceId(
      MERCHANT_LOGIN,
      testAmount,
      invId,
      description,
      ROBOKASSA_PASSWORD_1
    )

    const { bot_name } = getBotNameByToken(ctx.telegram.token)

    await setPayments({
      telegram_id: userId.toString(),
      OutSum: testAmount.toString(),
      InvId: invId.toString(),
      currency: Currency.RUB,
      stars: testStars,
      status: PaymentStatus.PENDING,
      payment_method: 'Robokassa',
      type: PaymentType.MONEY_INCOME,
      subscription_type: subscriptionType,
      bot_name,
      language: ctx.from?.language_code ?? 'en',
      metadata: {
        admin_test: true,
        original_amount: originalStars,
        test_amount: testAmount,
      },
    })

    logger.info(
      `[${ModeEnum.RublePaymentScene}] PENDING ADMIN TEST SUBSCRIPTION payment saved for InvId: ${invId}, Sub: ${subscriptionType}`,
      {
        telegram_id: userId,
        invId: invId,
        isAdminTest: true,
      }
    )

    const inlineKeyboard = [
      [
        {
          text: isRu
            ? `Оплатить тест ${testAmount} ₽ (${subscriptionType})`
            : `Pay test ${testAmount} RUB (${subscriptionType})`,
          url: invoiceURL,
        },
      ],
    ]

    await ctx.reply(
      isRu
        ? `✅ <b>Админ-тест: Счет на подписку ${subscriptionType} создан</b>\nТестовая сумма: ${testAmount} ₽ (вместо обычных ${Math.floor(originalStars * 2.3)} ₽)\n\n🧪 Это тестовый платеж для проверки системы.\n\nНажмите кнопку ниже для перехода к оплате.`
        : `✅ <b>Admin Test: Invoice for subscription ${subscriptionType} created</b>\nTest amount: ${testAmount} RUB (instead of usual ${Math.floor(originalStars * 2.3)} RUB)\n\n🧪 This is a test payment for system verification.\n\nClick the button below to proceed with payment.`,
      {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
        parse_mode: 'HTML',
      }
    )

    logger.info(
      `[${ModeEnum.RublePaymentScene}] Admin test subscription invoice message sent to user ${userId}`
    )
  } catch (error: any) {
    logger.error(
      `❌ [${ModeEnum.RublePaymentScene}] Error in admin test subscription:`,
      {
        error: error.message,
        telegram_id: userId,
        subscription: ctx.match[1],
      }
    )
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при создании тестового счета.'
        : 'An error occurred while creating the test invoice.'
    )
  }
})

// Выход из сцены
rublePaymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  logger.info(
    `[${ModeEnum.RublePaymentScene}] Leaving scene via Main Menu button`,
    {
      telegram_id: ctx.from?.id,
    }
  )
  await ctx.scene.enter(ModeEnum.MainMenu)
})

// Обработка любых других сообщений
rublePaymentScene.on('message', async ctx => {
  const isRu = isRussian(ctx)
  logger.warn(`[${ModeEnum.RublePaymentScene}] Received unexpected message`, {
    telegram_id: ctx.from?.id,
    // @ts-ignore
    message_text: ctx.message?.text,
  })
  await ctx.reply(
    isRu
      ? 'Пожалуйста, выберите сумму для пополнения или вернитесь в главное меню.'
      : 'Please select a top-up amount or return to the main menu.'
  )
})
