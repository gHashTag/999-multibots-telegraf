import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussian } from '@/helpers'
import {
  getInvoiceId,
  merchantLogin,
  password1,
  description,
  subscriptionTitles,
} from './helper'
import { setPayments } from '../../core/supabase'
import { WizardScene } from 'telegraf/scenes'
import { getBotNameByToken } from '@/core'

export async function generateInvoiceStep(ctx: MyContext) {
  console.log('CASE: generateInvoiceStep')
  const isRu = isRussian(ctx)
  const selectedPayment = ctx.session.selectedPayment

  if (selectedPayment) {
    const email = ctx.session.email
    console.log('Email from session:', email)

    const subscription = selectedPayment.subscription
    let amount: number
    let stars: number
    if (subscription === 'neurophoto') {
      amount = 1110 // Правильная сумма для НейроФото
      stars = 476
    } else if (subscription === 'neurobase') {
      amount = 2999 // Правильная сумма для НейроБаза
      stars = 1303
    }

    try {
      const userId = ctx.from?.id
      console.log('User ID:', userId)

      const invId = Math.floor(Math.random() * 1000000)
      console.log('Generated invoice ID:', invId)

      // Получение invoiceID
      const invoiceURL = await getInvoiceId(
        merchantLogin,
        amount, // Используем исправленную сумму
        invId,
        description,
        password1
      )
      console.log('Invoice URL:', invoiceURL)
      const { bot_name } = getBotNameByToken(ctx.telegram.token)

      try {
        // Сохранение платежа со статусом PENDING
        await setPayments({
          telegram_id: userId.toString(),
          OutSum: amount.toString(),
          InvId: invId.toString(),
          currency: 'RUB',
          stars,
          status: 'PENDING',
          payment_method: 'Telegram',
          subscription: subscription,
          bot_name,
          language: ctx.from?.language_code,
        })
        console.log('Payment saved with status PENDING')
      } catch (error) {
        console.error('Error in setting payments:', error)
        await ctx.reply(
          isRu
            ? `Ошибка при создании платежа. Пожалуйста, попробуйте снова. ${error}`
            : `Error in creating payment. Please try again. ${error}`
        )
      }

      // Отправка сообщения пользователю с ссылкой на оплату
      const inlineKeyboard = [
        [
          {
            text: isRu
              ? `Оплатить ${
                  subscriptionTitles(isRu)[subscription]
                } за ${amount} р.`
              : `Pay for ${
                  subscriptionTitles(isRu)[subscription]
                } for ${amount} RUB.`,
            url: invoiceURL,
          },
        ],
      ]

      await ctx.reply(
        isRu
          ? `<b>💵 Чек создан для подписки ${
              subscriptionTitles(isRu)[subscription]
            }</b>
Нажмите кнопку ниже, чтобы перейти к оплате.

В случае возникновения проблем с оплатой, пожалуйста, свяжитесь с нами @neuro_sage`
          : `<b>💵 Invoice created for subscription ${
              subscriptionTitles(isRu)[subscription]
            }</b>
Click the button below to proceed with payment.

In case of payment issues, please contact us @neuro_sage`,
        {
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
          parse_mode: 'HTML',
        }
      )
      console.log('Payment message sent to user with URL button')

      // Завершение сцены
      return ctx.scene.leave()
    } catch (error) {
      console.error('Error in creating invoice:', error)
      await ctx.reply(
        isRu
          ? 'Ошибка при создании чека. Пожалуйста, попробуйте снова.'
          : 'Error creating invoice. Please try again.'
      )
    }
  }
}

export const getRuBillWizard = new WizardScene(
  'getRuBillWizard',
  generateInvoiceStep
)
