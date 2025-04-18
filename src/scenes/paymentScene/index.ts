import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import {
  handleSelectStars,
  handleBuySubscription,
  handleBuy,
  handleSelectRubAmount,
} from '@/handlers'
import { starAmounts } from '@/price/helpers/starAmounts'
import { getInvoiceId } from '@/scenes/getRuBillWizard/helper'
import { MERCHANT_LOGIN, PASSWORD1 } from '@/config'
import { setPayments } from '@/core/supabase'
import { getBotNameByToken } from '@/core'
import { rubTopUpOptions } from '@/price/helpers/rubTopUpOptions'

export const paymentScene = new Scenes.BaseScene<MyContext>('paymentScene')

paymentScene.enter(async ctx => {
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
        {
          text: isRu ? 'Что такое звезды❓' : 'What are stars❓',
          web_app: {
            url: `https://telegram.org/blog/telegram-stars/${
              isRu ? 'ru' : 'en'
            }?ln=a`,
          },
        },
      ],
      [
        Markup.button.text(isRu ? '💳 Рублями' : '💳 In rubles'),
        Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu'),
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

// Обработчик колбэка для пополнения ЗВЕЗДАМИ (Telegram Stars)
paymentScene.action(/top_up_\d+/, async ctx => {
  try {
    console.log('[PaymentScene] Обработка callback top_up (Stars) в сцене')
    const data = ctx.match[0]
    console.log('[PaymentScene] Callback data:', data)
    const isRu = isRussian(ctx)

    try {
      await ctx.answerCbQuery()
    } catch (e) {
      console.error('[PaymentScene] Ошибка при ответе на callback:', e)
    }

    await handleBuy({ ctx, data, isRu })
    console.log(
      '[PaymentScene] Обработка callback top_up (Stars) успешно завершена'
    )
    // После успешной отправки инвойса Telegram Stars можно выйти из сцены
    await ctx.scene.leave()
  } catch (error) {
    console.error(
      '[PaymentScene] Ошибка обработки callback top_up (Stars):',
      error
    )
    const isRu = isRussian(ctx)
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при обработке покупки звезд. Пожалуйста, попробуйте позже.'
        : 'An error occurred while processing star purchase. Please try again later.'
    )
    await ctx.scene.leave()
  }
})

// НОВЫЙ обработчик колбэка для пополнения РУБЛЯМИ (Robokassa)
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

    // Сохраняем платеж в БД со статусом PENDING
    await setPayments({
      telegram_id: userId.toString(),
      OutSum: amountRub.toString(),
      InvId: invId.toString(),
      currency: 'RUB', // Валюта - Рубли
      stars: stars, // Количество звезд за это пополнение
      status: 'PENDING',
      payment_method: 'Robokassa',
      subscription: 'stars', // Тип - пополнение звезд
      bot_name,
      language: ctx.from?.language_code,
    })

    console.log('[PaymentScene] Отправляем ссылку Robokassa пользователю')
    // Отправляем сообщение со ссылкой на оплату
    await ctx.reply(
      isRu
        ? `👇 Нажмите кнопку ниже, чтобы перейти к оплате ${amountRub} ₽ через Robokassa и получить ${stars} ⭐️.`
        : `👇 Click the button below to proceed with the payment of ${amountRub} RUB via Robokassa and receive ${stars} ⭐️.`,
      Markup.inlineKeyboard([
        Markup.button.url(
          isRu ? 'Перейти к оплате' : 'Proceed to Payment',
          invoiceURL
        ),
      ])
    )

    console.log(
      '[PaymentScene] Обработка callback top_up_rub успешно завершена, выходим из сцены'
    )
    await ctx.scene.leave() // Выходим из сцены после отправки ссылки
  } catch (error) {
    console.error('[PaymentScene] Ошибка обработки callback top_up_rub:', error)
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при формировании счета на оплату. Пожалуйста, попробуйте позже.'
        : 'An error occurred while creating the payment invoice. Please try again later.'
    )
    await ctx.scene.leave()
  }
})

paymentScene.hears(['⭐️ Звездами', '⭐️ Stars'], async ctx => {
  console.log('[PaymentScene] Hears: ⭐️ Звездами triggered')
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription
  console.log(
    '[PaymentScene] Hears: ⭐️ Звездами. Session subscription:',
    subscription
  )
  try {
    if (subscription) {
      if (['neurobase', 'neuroblogger', 'neurophoto'].includes(subscription)) {
        await handleBuySubscription({ ctx, isRu })
        await ctx.scene.leave()
        return
      } else if (subscription === 'stars') {
        // Показываем выбор звезд для оплаты через Telegram Stars
        await handleSelectStars({ ctx, isRu, starAmounts })
        // НЕ выходим из сцены, ждем callback top_up_X
        return
      }
    } else {
      // Неопределенная подписка - показываем выбор звезд для Telegram Stars
      await handleSelectStars({ ctx, isRu, starAmounts })
      // НЕ выходим из сцены
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
  const subscription = ctx.session.subscription
  console.log(
    '[PaymentScene] Hears: 💳 Рублями. Session subscription:',
    subscription
  )
  try {
    if (
      [
        'neurobase',
        'neurophoto',
        'neuromeeting',
        'neuromentor',
        'neuroblogger',
      ].includes(subscription)
    ) {
      // Покупка ПОДПИСКИ рублями - идем в emailWizard
      console.log(`[PaymentScene] Entering getEmailWizard for ${subscription}`)
      return ctx.scene.enter('getEmailWizard')
    } else if (subscription === 'stars') {
      // Пополнение БАЛАНСА рублями - показываем выбор суммы
      console.log(
        '[PaymentScene] Показываем выбор суммы для пополнения рублями'
      )
      await handleSelectRubAmount({ ctx, isRu })
      // НЕ выходим из сцены, ждем callback top_up_rub_X
      return
    } else {
      // Неизвестная подписка
      console.warn(
        '[PaymentScene] Hears: 💳 Рублями. Unknown or missing subscription:',
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
