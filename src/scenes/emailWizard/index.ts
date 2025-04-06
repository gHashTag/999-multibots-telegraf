import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { logger } from '@/utils/logger'
import { isRussian } from '@/helpers'
import { paymentOptions } from '@/price/priceCalculator'
import md5 from 'md5'
import { MERCHANT_LOGIN, PASSWORD1, RESULT_URL2 } from '@/config'
import { handleHelpCancel } from '@/handlers'
import { inngest } from '@/inngest-functions/clients'

import { ModeEnum } from '@/price/helpers/modelsCost'
import { v4 as uuidv4 } from 'uuid'
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

      if (!merchantLogin || !password1) {
        throw new Error('merchantLogin or password1 is not defined')
      }

      try {
        if (!ctx.from) {
          throw new Error('User data is undefined')
        }

        const userId = ctx.from.id
        const invId = uuidv4()
        const description = 'Balance replenishment'

        const numericAmount = Number(amount)
        const numericInvId = Number(invId)

        // Получение invoiceID
        const invoiceURL = await getInvoiceId(
          merchantLogin,
          numericAmount,
          numericInvId,
          description,
          password1
        )

        logger.info('✅ Обработка платежа в EmailWizard:', {
          description: 'Processing payment in EmailWizard',
          telegram_id: userId,
          amount: numericAmount,
          inv_id: numericInvId,
        })

        await inngest.send({
          name: 'payment/process',
          data: {
            telegram_id: String(userId),
            amount: Number(numericAmount),
            type: 'money_income',
            description: `Email payment:: ${stars}`,
            bot_name: ctx.botInfo.username,
            inv_id: String(numericInvId),
            stars: Number(stars),
          },
        })

        const inlineKeyboard = [
          [
            {
              text:
                ctx.from.language_code === 'ru'
                  ? `Купить ${numericAmount}⭐️ за ${numericAmount} р`
                  : `Buy ${numericAmount}⭐️ for ${numericAmount} RUB`,
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
