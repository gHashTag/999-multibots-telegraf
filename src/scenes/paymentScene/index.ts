import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleSelectStars } from '@/handlers/handleSelectStars'
import { starAmounts } from '@/price/helpers/starAmounts'
import { handleBuySubscription } from '@/handlers/handleBuySubscription'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { createPendingPayment } from '@/core/supabase/createPendingPayment'
import md5 from 'md5'
import { MERCHANT_LOGIN, PASSWORD1, TEST_PASSWORD1 } from '@/config'

const merchantLogin = MERCHANT_LOGIN
const password1 = PASSWORD1
const testPassword1 = TEST_PASSWORD1

// Флаг для использования тестового режима Robokassa
const useTestMode = false

/**
 * Генерирует короткий ID для заказа, подходящий для Robokassa
 * Создает ID заказа на основе времени и случайного числа, но с меньшей длиной
 * @param userId ID пользователя
 * @param amount Сумма заказа
 * @returns Короткий ID заказа (до 9 цифр)
 */
function generateShortInvId(userId: string | number, amount: number): number {
  try {
    // Берем последние 5 цифр timestamp
    const timestamp = Date.now() % 100000
    // Случайное число от 1000 до 9999
    const random = Math.floor(Math.random() * 9000) + 1000
    // Объединяем в одно число и возвращаем как целое число
    return parseInt(`${timestamp}${random}`)
  } catch (error) {
    console.error('❌ Ошибка при генерации короткого inv_id', {
      description: 'Error generating short inv_id',
      error,
      userId,
      amount,
    })
    // В случае ошибки возвращаем случайное число до 1 миллиона
    return Math.floor(Math.random() * 1000000) + 1
  }
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

  const signatureString = `${merchantLogin}:${outSum}:${invId}:${actualPassword}`
  console.log('📝 Строка для подписи:', {
    description: 'Signature string',
    signatureString,
  })

  const signatureValue = md5(signatureString).toUpperCase()

  // Формируем базовый URL Robokassa
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx'

  // Создаем параметры запроса - ВАЖНО: без ResultUrl2
  const params = new URLSearchParams({
    MerchantLogin: merchantLogin,
    OutSum: outSum.toString(),
    InvId: invId.toString(),
    Description: description,
    SignatureValue: signatureValue,
  })

  // Добавляем параметр IsTest только если включен тестовый режим
  if (isTest) {
    params.append('IsTest', '1')
  }

  const url = `${baseUrl}?${params.toString()}`
  console.log('✅ URL сформирован для Robokassa:', {
    message: 'URL generated for Robokassa',
    testMode: isTest,
    paymentUrl: url,
  })

  return url
}

async function getInvoiceId(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): Promise<string> {
  console.log('🚀 Запуск getInvoiceId', {
    description: 'Starting getInvoiceId',
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
    console.error('❌ Ошибка в getInvoiceId:', {
      description: 'Error in getInvoiceId',
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
    console.log('PaymentScene Enter:', {
      subscription: ctx.session.subscription,
      selectedPayment: ctx.session.selectedPayment,
    })

    // Если есть выбранный тариф в selectedPayment, используем его
    if (
      ctx.session.selectedPayment?.amount &&
      ctx.session.selectedPayment?.stars
    ) {
      const { amount, stars, subscription } = ctx.session.selectedPayment

      if (!ctx.from) {
        throw new Error('User not found')
      }

      if (!ctx.botInfo?.username) {
        throw new Error('Bot username is not defined')
      }

      if (!merchantLogin || !password1) {
        throw new Error('merchantLogin or password1 is not defined')
      }

      const userId = ctx.from.id
      const invId = generateShortInvId(userId, amount)
      const description = isRu ? 'Пополнение баланса' : 'Balance replenishment'
      const numericInvId = Number(invId)

      // Получение invoiceID
      const invoiceURL = await getInvoiceId(
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
        metadata: {
          payment_method: 'Robokassa',
          subscription,
        },
      })

      await ctx.reply(
        isRu
          ? `<b>💵 Оплата ${amount} р</b>
Нажмите на кнопку ниже, чтобы перейти к оплате. После успешной оплаты звезды автоматически будут зачислены на ваш баланс.`
          : `<b>💵 Payment ${amount} RUB</b>
Click the button below to proceed with payment. After successful payment, stars will be automatically credited to your balance.`,
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
      return ctx.scene.leave()
    }

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

paymentScene.hears(['⭐️ Звездами', '⭐️ Stars'], async ctx => {
  console.log('CASE 1: ⭐️ Звездами', ctx.match)
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription
  console.log('CASE 1: ⭐️ Звездами: subscription', subscription)
  if (subscription) {
    if (subscription === 'neurobase') {
      await handleBuySubscription({ ctx, isRu })
      await ctx.scene.leave()
    } else if (subscription === 'neuromeeting') {
      await handleBuySubscription({ ctx, isRu })
      await ctx.scene.leave()
    } else if (subscription === 'neuroblogger') {
      await handleBuySubscription({ ctx, isRu })
      await ctx.scene.leave()
    } else if (subscription === 'neurotester') {
      await handleBuySubscription({ ctx, isRu })
      await ctx.scene.leave()
    } else if (subscription === 'neurophoto') {
      await handleBuySubscription({ ctx, isRu })
      await ctx.scene.leave()
    } else if (subscription === 'neuromentor') {
      await handleBuySubscription({ ctx, isRu })
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

  // Получаем сумму из сессии или используем значение по умолчанию
  const subscription = ctx.session.subscription
  let amount = 0
  let stars = 0

  if (subscription === 'neurobase') {
    amount = 2999
    stars = 1303
  } else if (subscription === 'neurophoto') {
    amount = 1110
    stars = 476
  } else if (subscription === 'neuroblogger') {
    amount = 75000
    stars = 32608
  } else {
    // Если нет подписки, возвращаемся в главное меню
    await ctx.reply(
      isRu
        ? 'Пожалуйста, сначала выберите тариф.'
        : 'Please select a subscription plan first.'
    )
    await ctx.scene.enter('menuScene')
    return
  }

  try {
    const userId = ctx.from.id
    const invId = generateShortInvId(userId, amount)
    const description = isRu ? 'Пополнение баланса' : 'Balance replenishment'
    const numericInvId = Number(invId)

    if (!merchantLogin || !password1) {
      throw new Error('merchantLogin or password1 is not defined')
    }

    // Получение invoiceID
    const invoiceURL = await getInvoiceId(
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
      metadata: {
        payment_method: 'Robokassa',
        subscription,
      },
    })

    await ctx.reply(
      isRu
        ? `<b>💵 Оплата ${amount} р</b>
Нажмите на кнопку ниже, чтобы перейти к оплате. После успешной оплаты звезды автоматически будут зачислены на ваш баланс.`
        : `<b>💵 Payment ${amount} RUB</b>
Click the button below to proceed with payment. After successful payment, stars will be automatically credited to your balance.`,
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
  } catch (error) {
    console.error('Error in creating payment:', error)
    await ctx.reply(
      isRu
        ? 'Ошибка при создании чека. Пожалуйста, попробуйте снова.'
        : 'Error creating invoice. Please try again.'
    )
  }

  await ctx.scene.leave()
})

paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  console.log('CASE: 🏠 Главное меню', ctx.match)
  await ctx.scene.enter('menuScene')
})
