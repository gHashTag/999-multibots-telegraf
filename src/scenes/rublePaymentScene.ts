import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleSelectRubAmount } from '@/handlers'
import { rubTopUpOptions } from '@/price/helpers/rubTopUpOptions'
import { getInvoiceId } from '@/scenes/getRuBillWizard/helper'
import { MERCHANT_LOGIN, PASSWORD1 } from '@/config'
import { setPayments } from '@/core/supabase'
import { getBotNameByToken } from '@/core'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'

export const rublePaymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.RublePaymentScene
)

// Вход в сцену: Показываем варианты пополнения
rublePaymentScene.enter(async ctx => {
  logger.info('### rublePaymentScene ENTERED ###', {
    scene: ModeEnum.RublePaymentScene,
    step: 'enter',
    telegram_id: ctx.from?.id,
  })
  const isRu = isRussian(ctx)
  // Используем существующий хендлер для отображения кнопок
  await handleSelectRubAmount({ ctx, isRu })
})

// Обработка выбора суммы
rublePaymentScene.action(/top_up_rub_(\d+)/, async ctx => {
  const isRu = isRussian(ctx)
  try {
    await ctx.answerCbQuery() // Отвечаем на колбэк
    const amountRub = parseInt(ctx.match[1], 10)
    logger.info(
      `[${ModeEnum.RublePaymentScene}] Processing callback top_up_rub: ${amountRub} ₽`,
      {
        telegram_id: ctx.from?.id,
        amount: amountRub,
      }
    )

    const selectedOption = rubTopUpOptions.find(o => o.amountRub === amountRub)
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

    const invId = Math.floor(Math.random() * 1000000) // Генерируем ID счета
    const description = isRu
      ? `Пополнение баланса на ${stars} звезд`
      : `Balance top-up for ${stars} stars`

    logger.info(
      `[${ModeEnum.RublePaymentScene}] Generating Robokassa URL for ${amountRub} RUB (${stars} stars)`,
      {
        telegram_id: userId,
        amount: amountRub,
        stars: stars,
        invId: invId,
      }
    )

    const invoiceURL = await getInvoiceId(
      MERCHANT_LOGIN,
      amountRub,
      invId,
      description,
      PASSWORD1
    )

    const { bot_name } = getBotNameByToken(ctx.telegram.token)

    // Сохраняем платеж в БД со статусом PENDING
    await setPayments({
      telegram_id: userId.toString(),
      OutSum: amountRub.toString(),
      InvId: invId.toString(),
      currency: 'RUB',
      stars: stars,
      status: 'PENDING',
      payment_method: 'Robokassa',
      subscription: 'stars', // Тип - пополнение звезд
      bot_name,
      language: ctx.from?.language_code,
    })

    logger.info(
      `[${ModeEnum.RublePaymentScene}] PENDING payment saved for InvId: ${invId}`,
      {
        telegram_id: userId,
        invId: invId,
      }
    )

    // Формируем сообщение с кнопкой оплаты
    const inlineKeyboard = [
      [
        {
          text: isRu ? `Оплатить ${amountRub} ₽` : `Pay ${amountRub} RUB`,
          url: invoiceURL,
        },
      ],
    ]

    await ctx.reply(
      isRu
        ? `✅ <b>Счет создан</b>\nСумма: ${amountRub} ₽ (${stars} ⭐️)\n\nНажмите кнопку ниже для перехода к оплате через Robokassa.`
        : `✅ <b>Invoice created</b>\nAmount: ${amountRub} RUB (${stars} ⭐️)\n\nClick the button below to proceed with payment via Robokassa.`,
      {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
        parse_mode: 'HTML',
      }
    )
    logger.info(
      `[${ModeEnum.RublePaymentScene}] Robokassa invoice message sent to user ${userId}`
    )
    return ctx.scene.leave() // Выходим после отправки ссылки
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

// Выход из сцены
rublePaymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  logger.info(
    `[${ModeEnum.RublePaymentScene}] Leaving scene via Main Menu button`,
    {
      telegram_id: ctx.from?.id,
    }
  )
  await ctx.scene.enter(ModeEnum.MenuScene) // Переходим в главную сцену меню
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
  // Не выходим из сцены, даем пользователю выбрать
})
