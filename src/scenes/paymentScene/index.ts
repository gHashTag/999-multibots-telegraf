import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleSelectStars } from '@/handlers/handleSelectStars'
import { starAmounts } from '@/price/helpers/starAmounts'
import { handleBuySubscription } from '@/handlers/handleBuySubscription'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { createPendingPayment } from '@/core/supabase/createPendingPayment'
import md5 from 'md5'
import { MERCHANT_LOGIN, PASSWORD1, RESULT_URL2 } from '@/config'
import { generateInvId } from '@/utils/generateInvId'

const merchantLogin = MERCHANT_LOGIN
const password1 = PASSWORD1
const resultUrl2 = RESULT_URL2

function generateRobokassaUrl(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): string {
  if (!resultUrl2 || !merchantLogin || !password1) {
    throw new Error('resultUrl2 or merchantLogin or password1 is not defined')
  }
  const signatureValue = md5(
    `${merchantLogin}:${outSum}:${invId}:${encodeURIComponent(
      resultUrl2
    )}:${password1}`
  ).toUpperCase()
  const url = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvId=${invId}&Description=${encodeURIComponent(
    description
  )}&SignatureValue=${signatureValue}&ResultUrl2=${encodeURIComponent(
    resultUrl2
  )}`

  return url
}

async function getInvoiceId(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): Promise<string> {
  console.log('Start getInvoiceId', {
    merchantLogin,
    outSum,
    invId,
    description,
    password1,
  })
  try {
    const response = generateRobokassaUrl(
      merchantLogin,
      outSum,
      invId,
      description,
      password1
    )

    return response
  } catch (error) {
    console.error('Error in getInvoiceId:', error)
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
      const invId = generateInvId(userId, amount)
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
    const invId = generateInvId(userId, amount)
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
