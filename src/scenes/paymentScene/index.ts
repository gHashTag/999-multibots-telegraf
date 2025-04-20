import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import {
  handleSelectStars,
  handleBuySubscription,
  handleSelectRubAmount,
} from '@/handlers'
import { starAmounts } from '@/price/helpers/starAmounts'
import { getInvoiceId } from '@/scenes/getRuBillWizard/helper'
import { MERCHANT_LOGIN, PASSWORD1 } from '@/config'
import { setPayments } from '@/core/supabase'
import { getBotNameByToken } from '@/core'
import { rubTopUpOptions } from '@/price/helpers/rubTopUpOptions'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Старая сцена оплаты, теперь используется как точка входа
 * для выбора типа оплаты (Звезды или Рубли).
 */
export const paymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.PaymentScene
)

paymentScene.enter(async ctx => {
  console.log(`[PaymentScene LOG] === ENTER Scene === (User: ${ctx.from?.id})`)
  logger.info('### paymentScene ENTERED ###', {
    scene: ModeEnum.PaymentScene,
    step: 'enter',
    telegram_id: ctx.from?.id,
    session_subscription: ctx.session.subscription, // Логируем, что пришло в сессии
  })
  const isRu = isRussian(ctx)
  try {
    const message = isRu ? 'Выберите способ оплаты:' : 'Select payment method:'

    // Оставляем только кнопки выбора типа оплаты и справку по звездам
    const keyboard = Markup.keyboard([
      [
        Markup.button.text(isRu ? '⭐️ Звездами' : '⭐️ Stars'),
        Markup.button.text(isRu ? '💳 Рублями' : '💳 Rubles'), // Изменил эмодзи для единообразия
      ],
      [
        {
          text: isRu ? 'Что такое звезды❓' : 'What are stars❓',
          web_app: {
            url: `https://telegram.org/blog/telegram-stars/${
              isRu ? 'ru' : 'en'
            }?ln=a`,
          },
        },
      ],
      [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu')], // Добавляем кнопку выхода
    ]).resize()

    await ctx.reply(message, {
      reply_markup: keyboard.reply_markup,
      // Убираем старую клавиатуру, если она была
      // reply_markup: { remove_keyboard: true },
    })
  } catch (error: any) {
    logger.error(`❌ [${ModeEnum.PaymentScene}] Error in enter:`, {
      error: error.message,
      stack: error.stack,
      telegram_id: ctx.from?.id,
    })
    await ctx.reply(
      isRu
        ? 'Произошла ошибка. Пожалуйста, попробуйте войти снова через меню.'
        : 'An error occurred. Please try entering again via the menu.'
    )
    // Выходим из сцены в случае ошибки входа
    await ctx.scene.leave()
  }
})

// Переход в сцену оплаты Звездами
paymentScene.hears(['⭐️ Звездами', '⭐️ Stars'], async ctx => {
  console.log(
    `[PaymentScene LOG] --- HEARS '⭐️ Звездами' --- (User: ${ctx.from?.id})`
  )
  console.log('[PaymentScene] Hears: ⭐️ Звездами triggered')
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription?.toLowerCase()
  console.log(
    '[PaymentScene] Hears: ⭐️ Звездами. Session subscription:',
    subscription
  )
  try {
    if (subscription) {
      if (
        [
          'neurobase',
          'neuromeeting',
          'neuroblogger',
          'neurophoto',
          'neuromentor',
        ].includes(subscription)
      ) {
        console.log(
          `[PaymentScene LOG] Calling handleBuySubscription for known subscription: ${subscription}`
        )
        await handleBuySubscription({ ctx, isRu })
        await ctx.scene.leave()
        return
      } else if (subscription === 'stars') {
        console.log(
          `[PaymentScene LOG] Calling handleSelectStars for 'stars' subscription.`
        )
        await handleSelectStars({ ctx, isRu, starAmounts })
        await ctx.scene.leave()
        return
      }
    } else {
      console.log(
        `[PaymentScene LOG] Calling handleSelectStars (no subscription in session).`
      )
      await handleSelectStars({ ctx, isRu, starAmounts })
      await ctx.scene.leave()
      return
    }
  )
  // Просто переходим в новую сцену, передавая управление ей
  // ctx.session.subscription остается как есть (если был установлен ранее)
  await ctx.scene.enter(ModeEnum.StarPaymentScene)
})

// Переход в сцену оплаты Рублями
paymentScene.hears(['💳 Рублями', '💳 Rubles'], async ctx => {
  logger.info(
    `[${ModeEnum.PaymentScene}] User chose Rubles. Entering ${ModeEnum.RublePaymentScene}`,
    {
      telegram_id: ctx.from?.id,
    }
  )
  // Просто переходим в новую сцену
  // ctx.session.subscription остается как есть
  await ctx.scene.enter(ModeEnum.RublePaymentScene)
})

// Выход в главное меню
paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  logger.info(`[${ModeEnum.PaymentScene}] Leaving scene via Main Menu button`, {
    telegram_id: ctx.from?.id,
  })
  await ctx.scene.enter(ModeEnum.MenuScene)
})

// Убираем обработчики action (top_up_*, buy_sub_*), т.к. они теперь в дочерних сценах

    try {
      await ctx.answerCbQuery() // Отвечаем на колбэк
    } catch (e) {
      console.error('[PaymentScene] Ошибка при ответе на callback rub:', e)
    }

    // Ищем опцию пополнения, чтобы получить кол-во звезд
    const selectedOption = rubTopUpOptions.find(o => o.amountRub === amountRub)
    if (!selectedOption) {
      console.error(
        `[PaymentScene] Не найдена опция пополнения для ${amountRub} руб`
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
    const invId = Math.floor(Math.random() * 1000000) // Генерируем ID счета
    const description = isRu
      ? `Пополнение баланса на ${stars} звезд`
      : `Balance top-up for ${stars} stars`

    console.log(
      `[PaymentScene] Генерируем Robokassa URL для ${amountRub} руб (${stars} звезд)`
    )
    const invoiceURL = await getInvoiceId(
      MERCHANT_LOGIN,
      amountRub,
      invId,
      description,
      PASSWORD1
    )

    const { bot_name } = getBotNameByToken(ctx.telegram.token)

    // Сохраняем платеж в БД со статусом PENDING (используем payments_v2)
    await setPayments({
      telegram_id: userId.toString(),
      OutSum: amountRub.toString(),
      InvId: invId.toString(),
      currency: 'RUB', // Валюта - Рубли
      stars: stars, // Количество звезд за это пополнение
      status: 'PENDING',
      payment_method: 'Robokassa',
      subscription: 'stars', // Тип - пополнение звезд (или BALANCE_TOPUP?)
      bot_name,
      language: ctx.from?.language_code,
    })

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
    console.log('[PaymentScene] Robokassa invoice message sent to user')
    return ctx.scene.leave()
  } catch (error) {
    console.error('[PaymentScene] Ошибка обработки callback top_up_rub:', error)
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при создании счета Robokassa.'
        : 'An error occurred while creating the Robokassa invoice.'
    )
    return ctx.scene.leave()
  }
})
