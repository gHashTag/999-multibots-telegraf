import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { saveUserEmail, setPayments } from '../../core/supabase'
import {
  isRussianFromState,
  getUserLanguageFromState,
} from '@/helpers/centralizedLanguage'

import md5 from 'md5'
import {
  getMerchantLogin,
  UNIFIED_RESULT_URL,
  getRobokassaPassword1,
} from '@/config'
import { handleHelpCancel } from '@/navigation'
import { getBotNameByToken } from '@/core'
import {
  PaymentStatus,
  Currency,
  PaymentType,
} from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { supportMention } from '@/config/support'
const merchantLogin = getMerchantLogin() || ''

const description = 'Покупка звезд'

const paymentOptions = [
  { amount: 2000, stars: '1250' },
  { amount: 5000, stars: '3125' },
  { amount: 10000, stars: '6250' },
  // { amount: 10, stars: '6' },
]

const resultUrl2 = UNIFIED_RESULT_URL

function generateRobokassaUrl(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): string {
  if (!merchantLogin) {
    console.error('❌ Merchant login not found')
    return ''
  }
  if (!password1) {
    console.error('❌ Password not found')
    return ''
  }
  if (!resultUrl2) {
    console.error('❌ Result URL not found')
    return ''
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

export async function getInvoiceId(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): Promise<string> {
  // Do NOT log password1 (the Robokassa merchant secret): plain-string values are
  // not redacted by setupSafeConsoleLogging, so the verbatim secret would hit
  // stdout/Railway logs and let a log reader forge payment signatures. Log only a
  // presence flag, matching getRuBillWizard.
  console.log('Start getInvoiceId', {
    merchantLogin,
    outSum,
    invId,
    description,
    hasPassword1: !!password1,
  })
  try {
    const signatureValue = md5(
      `${merchantLogin}:${outSum}:${invId}:${password1}`
    )
    console.log('signatureValue', signatureValue)

    const response = generateRobokassaUrl(
      merchantLogin,
      outSum,
      invId,
      description,
      password1
    )
    console.log('response', response)

    return response
  } catch (error) {
    console.error('Error in getInvoiceId:', error)
    throw error
  }
}

export const emailWizard = new Scenes.BaseScene<MyContext>('emailWizard')

emailWizard.enter(async ctx => {
  const isRu = isRussianFromState(ctx)
  await ctx.reply(
    isRu
      ? '👉 Для формирования счета напишите ваш E-mail.'
      : '👉 To generate an invoice, please provide your E-mail.',
    Markup.keyboard([Markup.button.text(isRu ? 'Отмена' : 'Cancel')]).resize()
  )
})

emailWizard.hears(/@/, async ctx => {
  const isRu = isRussianFromState(ctx)
  const email = ctx.message.text

  try {
    if (!ctx.from) {
      throw new Error('User not found')
    }
    ctx.session.email = email
    await saveUserEmail(ctx.from.id.toString(), email)
    await ctx.reply(
      isRu
        ? 'Ваш e-mail успешно сохранен'
        : 'Your e-mail has been successfully saved',
      Markup.removeKeyboard()
    )

    const buttons = paymentOptions.map(option => [
      isRu
        ? `Купить ${option.stars}⭐️ за ${option.amount} р`
        : `Buy ${option.stars}⭐️ for ${option.amount} RUB`,
    ])

    const keyboard = Markup.keyboard(buttons).resize()

    await ctx.reply(
      isRu ? 'Выберите сумму для оплаты:' : 'Choose the amount for payment:',
      {
        reply_markup: keyboard.reply_markup,
      }
    )
  } catch (error) {
    await ctx.reply(
      isRu
        ? 'Ошибка при сохранении e-mail. Пожалуйста, попробуйте снова.'
        : 'Error saving e-mail. Please try again.'
    )
  }
})

emailWizard.on('text', async ctx => {
  const isRu = isRussianFromState(ctx)
  const msg = ctx.message

  if (msg && 'text' in msg) {
    const selectedOption = msg.text

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    const match = isRu
      ? selectedOption.match(/Купить (\d+)⭐️ за (\d+) р/)
      : selectedOption.match(/Buy (\d+)⭐️ for (\d+) RUB/)

    const stars = match ? parseInt(match[1], 10) : NaN
    const amount = match ? parseInt(match[2], 10) : NaN
    // stars/amount come from a user text message (on('text')); the matched pair
    // must equal a legit paymentOption, or a crafted "buy 6250 stars for 1 RUB"
    // would create a 1-RUB Robokassa invoice that credits 6250 stars (pricing
    // bypass). An invalid pair falls through to the else "valid amount" reply.
    const isValidOption = paymentOptions.some(
      option => parseInt(option.stars, 10) === stars && option.amount === amount
    )

    if (match && isValidOption) {
      try {
        if (!ctx.from) {
          console.error('❌ Telegram ID не найден')
          return
        }
        const userId = ctx.from?.id
        if (!userId) {
          console.error('❌ Telegram ID не найден')
          return
        }
        if (!ctx.from?.language_code) {
          console.error('❌ Telegram ID не найден')
          return
        }
        if (!merchantLogin) {
          console.error('❌ Merchant login not found')
          return
        }
        const password1 = getRobokassaPassword1()
        if (!password1) {
          console.error('❌ Password not found')
          return
        }
        // ✅ ИСПРАВЛЕНИЕ: Используем Date.now() для уникального возрастающего InvId
        // Robokassa требует уникальный InvId как счётчик (1 <= InvId <= 2147483647)
        const invId = Date.now() % 2147483647
        // Получение invoiceID
        const invoiceURL = await getInvoiceId(
          merchantLogin,
          amount,
          invId,
          description,
          password1
        )

        const { bot_name } = getBotNameByToken(ctx.telegram.token)

        // Сохранение платежа со статусом PENDING
        await setPayments({
          telegram_id: userId.toString(),
          OutSum: amount.toString(),
          InvId: invId.toString(),
          currency: Currency.RUB,
          status: PaymentStatus.PENDING,
          stars,
          payment_method: 'Robokassa',
          subscription_type: SubscriptionType.STARS,
          bot_name,
          language: getUserLanguageFromState(ctx) || 'ru',
          type: PaymentType.MONEY_INCOME,
        })

        console.log('invoiceURL', invoiceURL)

        const inlineKeyboard = [
          [
            {
              text: isRu
                ? `Купить ${stars}⭐️ за ${amount} р`
                : `Buy ${stars}⭐️ for ${amount} RUB`,
              web_app: {
                url: invoiceURL,
              },
            },
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
        ]

        await ctx.reply(
          isRu
            ? `<b>🤑 Пополнение баланса</b>
Теперь вы можете пополнить баланс на любое количество звезд и использовать их для различных функций бота.\nПросто выберите количество звезд, которое вы хотите добавить на свой баланс.\nВ случае возникновения проблем с оплатой, пожалуйста, свяжитесь с нами ${supportMention()}`
            : `<b>🤑 Balance Top-Up</b>
You can now top up your balance with any number of stars and use them for various bot features. Simply choose the number of stars you want to add to your balance.\nIn case of payment issues, please contact us ${supportMention()}`,
          {
            reply_markup: {
              inline_keyboard: inlineKeyboard,
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
      return ctx.scene.leave()
    } else {
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите корректную сумму.'
          : 'Please select a valid amount.'
      )
    }
  }
})

export default emailWizard
