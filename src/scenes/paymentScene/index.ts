import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleSelectStars } from '@/handlers/handleSelectStars'
import { starAmounts } from '@/price/helpers/starAmounts'
import { handleBuySubscription } from '@/handlers/handleBuySubscription'
import { ModeEnum } from '@/interfaces/modes'
import { createPendingPayment } from '@/core/supabase/createPendingPayment'
import md5 from 'md5'
import { MERCHANT_LOGIN, TEST_PASSWORD1, isDev } from '@/config'
import { generateShortInvId } from '@/scenes/getRuBillWizard/helper'
import { paymentOptions } from '@/price/priceCalculator'
import { TransactionType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { getSubscriptionInfo } from '@/utils/getSubscriptionInfo'
import { SubscriptionType } from '@/interfaces/payments.interface'

const merchantLogin = MERCHANT_LOGIN
const password1 = process.env.ROBOKASSA_PASSWORD1 || ''
const testPassword1 = TEST_PASSWORD1

// Флаг для использования тестового режима Robokassa
const useTestMode = isDev

// В начале файла добавим проверку конфигурации
if (!merchantLogin) {
  throw new Error('MERCHANT_LOGIN is not defined in environment variables')
}

function generateRobokassaUrl(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string,
  isTest: boolean = useTestMode
): string {
  if (!merchantLogin || !password1) {
    throw new Error('merchantLogin or password1 is not defined')
  }

  // Если включен тестовый режим и доступен тестовый пароль, используем его
  const actualPassword = isTest && testPassword1 ? testPassword1 : password1

  console.log('🔍 Формирование URL для Robokassa', {
    description: 'Generating Robokassa URL',
    merchantLogin,
    outSum,
    invId,
    isTestMode: isTest,
    usingTestPassword: isTest && testPassword1 ? true : false,
    mode: isTest ? 'ТЕСТОВЫЙ РЕЖИМ' : 'БОЕВОЙ РЕЖИМ',
  })

  // Убеждаемся, что invId - целое число и не слишком длинное
  if (!Number.isInteger(invId) || invId > 2147483647) {
    console.error('❌ Ошибка: InvId некорректный, будет преобразован', {
      description: 'Error: InvId is incorrect, will be converted',
      originalInvId: invId,
    })
    // Преобразуем в целое число если это не так и ограничиваем длину
    invId = Math.floor(invId % 1000000)
  }

  // Убеждаемся, что сумма положительная
  if (outSum <= 0) {
    console.error('❌ Ошибка: Сумма должна быть положительной', {
      description: 'Error: Sum must be positive',
      originalSum: outSum,
    })
    outSum = Math.abs(outSum) || 1 // Используем абсолютное значение или 1 если 0
  }

  // Проверяем description
  if (!description || description.trim() === '') {
    console.warn(
      '⚠️ Предупреждение: Описание пустое, используем значение по умолчанию',
      {
        description: 'Warning: Description is empty, using default',
      }
    )
    description = 'Покупка звезд'
  }

  // Формируем строку для подписи с корректными значениями
  const signatureString = `${merchantLogin}:${outSum}:${invId}:${actualPassword}`
  console.log('📝 Строка для подписи:', {
    description: 'Signature string',
    signatureString,
  })

  const signatureValue = md5(signatureString).toUpperCase()

  // Формируем базовый URL Robokassa
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx'

  // Создаем параметры запроса
  const params = new URLSearchParams()

  // Добавляем все параметры
  params.append('MerchantLogin', merchantLogin)
  params.append('OutSum', outSum.toString())
  params.append('InvId', invId.toString())
  params.append('Description', description)
  params.append('SignatureValue', signatureValue)

  // Добавляем параметр IsTest только если включен тестовый режим
  if (isTest) {
    params.append('IsTest', '1')
  }

  const url = `${baseUrl}?${params.toString()}`

  // Проверяем готовый URL
  try {
    const parsedUrl = new URL(url)
    const requiredParams = [
      'MerchantLogin',
      'OutSum',
      'InvId',
      'Description',
      'SignatureValue',
    ]
    const missingParams = []

    for (const param of requiredParams) {
      if (!parsedUrl.searchParams.has(param)) {
        missingParams.push(param)
      }
    }

    if (missingParams.length > 0) {
      console.error('❌ Ошибка: В URL отсутствуют обязательные параметры', {
        description: 'Error: URL is missing required parameters',
        missingParams,
      })
      throw new Error(
        `URL не содержит обязательные параметры: ${missingParams.join(', ')}`
      )
    }
  } catch (error) {
    console.error('❌ Ошибка при проверке URL:', {
      description: 'Error checking URL',
      error,
    })
    throw error
  }

  console.log('✅ URL сформирован для Robokassa:', {
    message: 'URL generated for Robokassa',
    testMode: isTest,
    paymentUrl: url,
  })

  return url
}

async function generateRobokassaInvoiceId(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): Promise<string> {
  if (!merchantLogin || !password1) {
    throw new Error('merchantLogin or password1 is not defined')
  }
  console.log('🚀 Запуск generateRobokassaInvoiceId', {
    description: 'Starting generateRobokassaInvoiceId',
    merchantLogin,
    outSum,
    invId,
    useTestMode,
  })
  try {
    // Используем тестовый пароль для тестового режима
    const actualPassword =
      useTestMode && testPassword1 ? testPassword1 : password1

    console.log('🔑 Выбран пароль для Robokassa', {
      description: 'Selected password for Robokassa',
      isTestMode: useTestMode,
      usingTestPassword: useTestMode && testPassword1 ? true : false,
    })

    const response = generateRobokassaUrl(
      merchantLogin,
      outSum,
      invId,
      description,
      actualPassword,
      useTestMode // Передаем флаг тестового режима
    )

    return response
  } catch (error) {
    console.error('❌ Ошибка в generateRobokassaInvoiceId:', {
      description: 'Error in generateRobokassaInvoiceId',
      error,
    })
    throw error
  }
}

export const paymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.PaymentScene
)

paymentScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  try {
    logger.info('🚀 Entering PaymentScene', {
      userId: ctx.from?.id,
      selectedPayment: ctx.session.selectedPayment,
      mode: ctx.session.selectedPayment?.type,
    })

    // Проверяем тип платежа
    if (
      ctx.session.selectedPayment?.type ===
      TransactionType.SUBSCRIPTION_PURCHASE
    ) {
      // Обработка покупки подписки
      const subscriptionType = ctx.session.subscription as SubscriptionType
      if (!subscriptionType) {
        await ctx.reply('Subscription type not found')
        return
      }

      const subscriptionInfo = getSubscriptionInfo(subscriptionType)
      if (!subscriptionInfo) {
        await ctx.reply('Invalid subscription type')
        return
      }

      const invoiceId = await generateRobokassaInvoiceId(
        merchantLogin,
        subscriptionInfo.price,
        generateShortInvId(ctx.from?.id || 0, subscriptionInfo.stars),
        `Subscription ${subscriptionType}`,
        password1
      )
      const invoiceUrl = `${process.env.PAYMENT_URL}/${invoiceId}`

      await createPendingPayment({
        telegram_id: ctx.from?.id?.toString() || '',
        amount: subscriptionInfo.price,
        stars: subscriptionInfo.stars,
        inv_id: invoiceId,
        description: `Subscription ${subscriptionType}`,
        bot_name: ctx.botInfo.username || 'NeuroBlogger',
        invoice_url: invoiceUrl,
        service_type: ModeEnum.Subscribe,
        type: TransactionType.SUBSCRIPTION_PURCHASE,
      })

      // Отправляем сообщение с кнопкой оплаты
      await ctx.reply(
        isRu
          ? `💫 Подписка ${subscriptionInfo.name}\n💰 Стоимость: ${subscriptionInfo.price} RUB\n⭐️ Бонус: ${subscriptionInfo.stars} звезд`
          : `💫 Subscription ${subscriptionInfo.name}\n💰 Price: ${subscriptionInfo.price} RUB\n⭐️ Bonus: ${subscriptionInfo.stars} stars`,
        Markup.inlineKeyboard([
          [Markup.button.url(isRu ? '💳 Оплатить' : '💳 Pay', invoiceUrl)],
        ])
      )
    } else {
      // Обработка пополнения баланса
      const amount = ctx.session.selectedPayment?.amount || 0
      const stars = ctx.session.selectedPayment?.stars || 0

      if (!amount || !stars) {
        throw new Error('Invalid payment amount or stars')
      }

      const invId = await generateShortInvId(ctx.from?.id || 0, stars)
      const description = isRu ? 'Пополнение баланса' : 'Balance top-up'

      // Создаем платеж в базе
      const paymentUrl = await generateRobokassaInvoiceId(
        merchantLogin || '',
        amount,
        invId,
        description,
        password1
      )

      await createPendingPayment({
        telegram_id: ctx.from?.id?.toString() || '',
        amount,
        stars,
        type: TransactionType.MONEY_INCOME,
        description,
        bot_name: 'NeuroBlogger',
        service_type: ModeEnum.TopUpBalance,
        inv_id: invId.toString(),
        invoice_url: paymentUrl,
        metadata: {
          payment_method: 'Robokassa',
          subscription: 'stars',
        },
      })

      // Отправляем сообщение с кнопкой оплаты
      await ctx.reply(
        isRu
          ? `💰 Сумма: ${amount} RUB\n⭐️ Бонус: ${stars} звезд`
          : `💰 Amount: ${amount} RUB\n⭐️ Bonus: ${stars} stars`,
        Markup.inlineKeyboard([
          [Markup.button.url(isRu ? '💳 Оплатить' : '💳 Pay', paymentUrl)],
        ])
      )
    }
  } catch (error) {
    logger.error('❌ Error in PaymentScene:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: ctx.from?.id,
    })

    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при создании платежа. Пожалуйста, попробуйте позже.'
        : '❌ An error occurred while creating the payment. Please try again later.'
    )
  }
})

paymentScene.hears(['⭐️ Звездами', '⭐️ Stars'], async ctx => {
  console.log('CASE 1: ⭐️ Звездами', ctx.match)
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription
  console.log('CASE 1: ⭐️ Звездами: subscription', subscription)
  if (subscription) {
    if (subscription === 'neurobase') {
      await handleBuySubscription(ctx)
      await ctx.scene.leave()
    } else if (subscription === 'neuromeeting') {
      await handleBuySubscription(ctx)
      await ctx.scene.leave()
    } else if (subscription === 'neuroblogger') {
      await handleBuySubscription(ctx)
      await ctx.scene.leave()
    } else if (subscription === 'neurotester') {
      await handleBuySubscription(ctx)
      await ctx.scene.leave()
    } else if (subscription === 'neurophoto') {
      await handleBuySubscription(ctx)
      await ctx.scene.leave()
    } else if (subscription === 'neuromentor') {
      await handleBuySubscription(ctx)
      await ctx.scene.leave()
    } else if (subscription === 'stars') {
      await handleSelectStars({ ctx, isRu, starAmounts })
      await ctx.scene.leave()
    }
  } else {
    await handleSelectStars({ ctx, isRu, starAmounts })
    await ctx.scene.leave()
  }
})

paymentScene.hears(['💳 Рублями', '💳 In rubles'], async ctx => {
  console.log('CASE: 💳 Рублями', ctx.match)
  const isRu = isRussian(ctx)

  if (!ctx.from) {
    throw new Error('User not found')
  }

  if (!ctx.botInfo?.username) {
    throw new Error('Bot username is not defined')
  }

  // Получаем подписку из сессии
  const subscription = ctx.session.subscription

  // Разделяем логику в зависимости от выбранного пути
  // Случай 1: Пользователь покупает подписку
  if (subscription && subscription !== 'stars') {
    try {
      const subscriptionInfo = getSubscriptionInfo(subscription)
      if (!subscriptionInfo) {
        await ctx.reply(
          isRu
            ? 'Неизвестный тип подписки. Пожалуйста, выберите подписку снова.'
            : 'Unknown subscription type. Please select a subscription again.'
        )
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
        return
      }

      const userId = ctx.from.id
      const invId = await generateShortInvId(
        ctx.from?.id || 0,
        subscriptionInfo.stars
      )
      const description = isRu
        ? `Подписка ${subscriptionInfo.name}`
        : `Subscription ${subscriptionInfo.name}`
      const numericInvId = Number(invId)

      if (!merchantLogin || !password1) {
        throw new Error('merchantLogin or password1 is not defined')
      }

      // Получение invoiceID
      const invoiceURL = await generateRobokassaInvoiceId(
        merchantLogin,
        subscriptionInfo.price,
        numericInvId,
        description,
        password1
      )

      // Создаем платеж в статусе PENDING
      await createPendingPayment({
        telegram_id: userId.toString(),
        amount: subscriptionInfo.price,
        stars: subscriptionInfo.stars,
        inv_id: numericInvId.toString(),
        description,
        bot_name: ctx.botInfo.username,
        language: ctx.from.language_code || 'ru',
        invoice_url: invoiceURL,
        service_type: ModeEnum.Subscribe,
        type: TransactionType.SUBSCRIPTION_PURCHASE,
        metadata: {
          payment_method: 'Robokassa',
          subscription,
        },
      })

      await ctx.reply(
        isRu
          ? `<b>💵 Оплата подписки ${subscriptionInfo.name} (${subscriptionInfo.price} р)</b>\nНажмите на кнопку ниже, чтобы перейти к оплате. После успешной оплаты звезды автоматически будут зачислены на ваш баланс.`
          : `<b>💵 Payment for subscription ${subscriptionInfo.name} (${subscriptionInfo.price} RUB)</b>\nClick the button below to proceed with payment. After successful payment, stars will be automatically credited to your balance.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu
                    ? `Оплатить ${subscriptionInfo.price} р`
                    : `Pay ${subscriptionInfo.price} RUB`,
                  url: invoiceURL,
                },
              ],
            ],
          },
          parse_mode: 'HTML',
        }
      )
    } catch (error) {
      console.error('Error in creating subscription payment:', error)
      await ctx.reply(
        isRu
          ? 'Ошибка при создании чека для подписки. Пожалуйста, попробуйте снова.'
          : 'Error creating subscription invoice. Please try again.'
      )
    }
  }
  // Случай 2: Пользователь просто пополняет баланс
  else {
    // Предлагаем выбор суммы для пополнения баланса
    const options = paymentOptions.map(option => {
      const starsNum = parseInt(option.stars)
      return [
        {
          text: isRu
            ? `${option.amount}₽ → ${option.stars}⭐`
            : `${option.amount}₽ → ${option.stars}⭐`,
          callback_data: `pay_rub_${option.amount}_${starsNum}`,
        },
      ]
    })

    // Добавляем кнопку возврата в меню
    options.push([
      {
        text: isRu ? '🔙 Назад' : '🔙 Back',
        callback_data: 'back_to_payment',
      },
    ])

    await ctx.reply(
      isRu
        ? '💰 Выберите сумму пополнения в рублях:'
        : '💰 Choose the amount to top up in rubles:',
      {
        reply_markup: {
          inline_keyboard: options,
        },
      }
    )

    // Не выходим из сцены, чтобы обработать выбор суммы
    return
  }

  await ctx.scene.leave()
})

// Добавляем обработчик для выбора суммы пополнения в рублях
paymentScene.action(/pay_rub_(\d+)_(\d+)/, async ctx => {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return
  }

  const isRu = isRussian(ctx)

  if (!ctx.from || !ctx.botInfo?.username) {
    await ctx.answerCbQuery('Error: User or bot data missing')
    return
  }

  try {
    // Получаем сумму и звезды из callback данных
    const match = ctx.callbackQuery.data.match(/pay_rub_(\d+)_(\d+)/)
    if (!match) {
      await ctx.answerCbQuery('Invalid data')
      return
    }

    const amount = parseInt(match[1])
    const stars = parseInt(match[2])

    // Создаем платеж
    const userId = ctx.from.id
    const invId = await generateShortInvId(ctx.from?.id || 0, stars)
    const description = isRu ? 'Пополнение баланса' : 'Balance replenishment'
    const numericInvId = Number(invId)

    if (!merchantLogin || !password1) {
      throw new Error('merchantLogin or password1 is not defined')
    }

    // Получение invoiceID
    const invoiceURL = await generateRobokassaInvoiceId(
      merchantLogin,
      amount,
      numericInvId,
      description,
      password1
    )

    // Создаем платеж в статусе PENDING
    await createPendingPayment({
      telegram_id: userId.toString(),
      amount,
      stars,
      inv_id: numericInvId.toString(),
      description,
      bot_name: ctx.botInfo.username,
      language: ctx.from.language_code || 'ru',
      invoice_url: invoiceURL,
      service_type: ModeEnum.TopUpBalance,
      type: TransactionType.MONEY_INCOME,
      metadata: {
        payment_method: 'Robokassa',
        subscription: 'stars',
      },
    })

    // Удаляем сообщение с выбором суммы
    await ctx.deleteMessage()

    // Отправляем новое сообщение с ссылкой на оплату
    await ctx.reply(
      isRu
        ? `<b>💵 Пополнение баланса на ${amount} р (${stars}⭐)</b>\nНажмите на кнопку ниже, чтобы перейти к оплате. После успешной оплаты звезды автоматически будут зачислены на ваш баланс.`
        : `<b>💵 Balance top-up for ${amount} RUB (${stars}⭐)</b>\nClick the button below to proceed with payment. After successful payment, stars will be automatically credited to your balance.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: isRu ? `Оплатить ${amount} р` : `Pay ${amount} RUB`,
                url: invoiceURL,
              },
            ],
          ],
        },
        parse_mode: 'HTML',
      }
    )

    // Выходим из сцены
    await ctx.scene.leave()
  } catch (error) {
    console.error('Error in creating top-up payment:', error)
    await ctx.answerCbQuery(
      isRu
        ? 'Ошибка при создании платежа. Попробуйте снова.'
        : 'Error creating payment. Please try again.'
    )
  }
})

// Добавляем обработчик для кнопки "Назад"
paymentScene.action('back_to_payment', async ctx => {
  const isRu = isRussian(ctx)

  // Удаляем сообщение с выбором суммы
  await ctx.deleteMessage()

  // Отправляем новое сообщение с выбором способа оплаты
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

  await ctx.reply(message, {
    reply_markup: keyboard.reply_markup,
  })
})

paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  console.log('CASE: 🏠 Главное меню', ctx.match)
  await ctx.scene.enter('menuScene')
})
