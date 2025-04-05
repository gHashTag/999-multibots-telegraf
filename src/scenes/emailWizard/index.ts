import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { setPayments } from '../../core/supabase'
import { isRussian } from '@/helpers'
import { paymentOptions } from '@/price/priceCalculator'
import md5 from 'md5'
import { MERCHANT_LOGIN, PASSWORD1, RESULT_URL2 } from '@/config'
import { handleHelpCancel } from '@/handlers'
import { getBotNameByToken } from '@/core'
import { ModeEnum } from '@/price/helpers/modelsCost'
const merchantLogin = MERCHANT_LOGIN
const password1 = PASSWORD1

const description = 'Покупка звезд'

const resultUrl2 = RESULT_URL2

function generateRobokassaUrl(
  merchantLogin: string,
  outSum: number,
  invId: number,
  description: string,
  password1: string
): string {
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

export const emailWizard = new Scenes.BaseScene<MyContext>(ModeEnum.EmailWizard)

emailWizard.enter(async ctx => {
  const isRu = isRussian(ctx)

  if (!ctx.from) {
    throw new Error('User not found')
  }

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
})

emailWizard.on('text', async ctx => {
  const isRu = isRussian(ctx)
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

    if (match) {
      const stars = parseInt(match[1], 10) // Количество звезд
      const amount = parseInt(match[2], 10) // Сумма в рублях

      try {
        const userId = ctx.from?.id
        const invId = Math.floor(Math.random() * 1000000)
        // Получение invoiceID
        const invoiceURL = await getInvoiceId(
          merchantLogin,
          amount,
          invId,
          description,
          password1
        )
        const email = ctx.session.email

        const { bot_name } = getBotNameByToken(ctx.telegram.token)

        // Сохранение платежа со статусом PENDING
        await setPayments({
          telegram_id: userId.toString(),
          OutSum: amount.toString(),
          InvId: invId.toString(),
          currency: 'RUB',
          stars,
          status: 'PENDING',
          email: email,
          payment_method: 'Telegram',
          subscription: 'stars',
          bot_name,
          language: ctx.from?.language_code,
          invoice_url: invoiceURL,
        })

        console.log('invoiceURL', invoiceURL)

        const inlineKeyboard = [
          [
            {
              text: isRu
                ? `Купить ${stars}⭐️ за ${amount} р`
                : `Buy ${stars}⭐️ for ${amount} RUB`,
              url: invoiceURL,
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
            ? `<b>💵 Пополнение баланса</b>
Теперь вы можете пополнить баланс на любое количество звезд и использовать их для различных функций бота.\nПросто выберите количество звезд, которое вы хотите добавить на свой баланс.\nВ случае возникновения проблем с оплатой, пожалуйста, свяжитесь с нами @neuro_sage`
            : `<b>💵 Balance Top-Up</b>
You can now top up your balance with any number of stars and use them for various bot features. Simply choose the number of stars you want to add to your balance.\nIn case of payment issues, please contact us @neuro_sage`,
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
