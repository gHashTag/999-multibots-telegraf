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

export const paymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.PaymentScene
)

paymentScene.enter(async ctx => {
  logger.info('### paymentScene ENTERED ###', {
    scene: 'paymentScene',
    step: 'enter',
    telegram_id: ctx.from?.id,
  })
  console.log(
    '[PaymentScene] Entered scene. Session subscription:',
    ctx.session.subscription
  )
  const isRu = isRussian(ctx)
  try {
    const message = isRu ? 'Как вы хотите оплатить?' : 'How do you want to pay?'

    const keyboard = Markup.keyboard([
      [
        Markup.button.text(isRu ? '⭐️ Звездами' : '⭐️ Stars'),
        Markup.button.text(isRu ? '💳 Рублями' : '💳 In rubles'),
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
    ]).resize()

    // Отправка сообщения с клавиатурой
    await ctx.reply(message, {
      reply_markup: keyboard.reply_markup,
    })
  } catch (error) {
    console.error('Error in paymentScene.enter:', error)
    await ctx.reply(
      isRu
        ? 'Произошла ошибка. Пожалуйста, попробуйте снова.'
        : 'An error occurred. Please try again.'
    )
  }
})

paymentScene.hears(['⭐️ Звездами', '⭐️ Stars'], async ctx => {
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
        await handleBuySubscription({ ctx, isRu })
        await ctx.scene.leave()
        return
      } else if (subscription === 'stars') {
        await handleSelectStars({ ctx, isRu, starAmounts })
        await ctx.scene.leave()
        return
      }
    } else {
      await handleSelectStars({ ctx, isRu, starAmounts })
      await ctx.scene.leave()
      return
    }
    console.warn(
      '[PaymentScene] Hears: ⭐️ Звездами. Unknown state for subscription:',
      subscription
    )
    await ctx.scene.leave()
    return
  } catch (error) {
    console.error("[PaymentScene] Error in Hears '⭐️ Звездами':", error)
    await ctx.reply(
      isRu
        ? 'Ошибка обработки оплаты звездами.'
        : 'Error processing star payment.'
    )
    await ctx.scene.leave()
    return
  }
})

paymentScene.hears(['💳 Рублями', '💳 In rubles'], async ctx => {
  console.log('[PaymentScene] Hears: 💳 Рублями triggered')
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription?.toLowerCase()
  console.log(
    '[PaymentScene] Hears: 💳 Рублями. Session subscription:',
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
          `[PaymentScene] Entering getEmailWizard for ${subscription}`
        )
        return ctx.scene.enter('getEmailWizard')
      } else if (subscription === 'stars') {
        // Пополнение БАЛАНСА рублями (уже выбрана подписка 'stars') - показываем выбор суммы
        console.log(
          '[PaymentScene] Показываем выбор суммы для пополнения рублями (подписка stars)'
        )
        await handleSelectRubAmount({ ctx, isRu })
        // НЕ выходим из сцены, ждем callback top_up_rub_X
        return
      } else {
        // Неизвестная подписка
        console.warn(
          '[PaymentScene] Hears: 💳 Рублями. Unknown subscription:',
          subscription
        )
        await ctx.reply(
          isRu
            ? 'Сначала выберите подписку или пакет звезд для покупки.'
            : 'Please select a subscription or star package first.'
        )
        await ctx.scene.leave()
        return
      }
    } else {
      // Если подписка не выбрана (например, из главного меню)
      // Показываем выбор суммы для пополнения рублями
      console.log(
        '[PaymentScene] Показываем выбор суммы для пополнения рублями (без подписки)'
      )
      await handleSelectRubAmount({ ctx, isRu })
      // НЕ выходим из сцены
      return
    }
  } catch (error) {
    console.error("[PaymentScene] Error in Hears '💳 Рублями':", error)
    await ctx.reply(
      isRu
        ? 'Ошибка обработки оплаты рублями.'
        : 'Error processing ruble payment.'
    )
    await ctx.scene.leave()
    return
  }
})

paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  console.log('[PaymentScene] Hears: 🏠 Главное меню triggered')
  await ctx.scene.enter('menuScene')
  return
})

paymentScene.action(/top_up_rub_(\d+)/, async ctx => {
  const isRu = isRussian(ctx)
  try {
    const amountRub = parseInt(ctx.match[1], 10)
    console.log(`[PaymentScene] Обработка callback top_up_rub: ${amountRub} ₽`)

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
