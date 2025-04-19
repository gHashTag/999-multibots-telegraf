import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleHelpCancel } from '@/handlers'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import {
  getInvoiceId,
  merchantLogin,
  password1,
  description,
  subscriptionTitles,
} from './helper'
import { setPayments } from '@/core/supabase'
import { WizardScene } from 'telegraf/scenes'
import { getBotNameByToken } from '@/core'
import { logger } from '@/utils/logger'

const generateInvoiceStep = async (ctx: MyContext) => {
  logger.info('### getRuBillWizard ENTERED (generateInvoiceStep) ###', {
    scene: 'getRuBillWizard',
    step: 'generateInvoiceStep',
    telegram_id: ctx.from?.id,
  })
  console.log('CASE: generateInvoiceStep')
  const isRu = isRussian(ctx)
  const selectedPayment = ctx.session.selectedPayment
  console.log('selectedPayment', selectedPayment)
  if (selectedPayment) {
    const email = ctx.session.email
    console.log('Email from session:', email)

    const subscription = selectedPayment.subscription.toLowerCase()
    let amount: number
    let stars: number
    if (subscription === SubscriptionType.NEUROPHOTO.toLowerCase()) {
      amount = 1110 // Правильная сумма для НейроФото
      stars = 476
    } else if (subscription === SubscriptionType.NEUROBASE.toLowerCase()) {
      amount = 2999 // Правильная сумма для НейроБаза
      stars = 1303
    } else {
      await ctx.reply(
        isRu
          ? 'Ошибка: Неизвестный тип подписки.'
          : 'Error: Unknown subscription type.'
      )
      return ctx.scene.leave()
    }

    try {
      const userId = ctx.from?.id
      console.log('User ID:', userId)
      if (!userId) {
        await ctx.reply(
          isRu
            ? 'Ошибка: Не удалось получить ID пользователя.'
            : 'Error: Could not get user ID.'
        )
        return ctx.scene.leave()
      }

      const invId = Math.floor(Math.random() * 1000000)
      console.log('Generated invoice ID:', invId)

      const invoiceURL = await getInvoiceId(
        merchantLogin,
        amount,
        invId,
        description,
        password1
      )
      console.log('Invoice URL:', invoiceURL)
      const { bot_name } = getBotNameByToken(ctx.telegram.token)

      try {
        await setPayments({
          telegram_id: userId.toString(),
          OutSum: amount.toString(),
          InvId: invId.toString(),
          currency: 'RUB',
          stars,
          status: 'PENDING',
          payment_method: 'Robokassa',
          subscription: subscription,
          bot_name,
          language: ctx.from?.language_code,
        })
        console.log('Payment saved with status PENDING')
      } catch (error) {
        console.error('Error in setting payments:', error)
        await ctx.reply(
          isRu
            ? `Ошибка при создании платежа в базе данных. Пожалуйста, попробуйте снова. ${
                error instanceof Error ? error.message : error
              }`
            : `Error creating payment in database. Please try again. ${
                error instanceof Error ? error.message : error
              }`
        )
        return ctx.scene.leave()
      }

      const subTitle = subscriptionTitles(isRu)[subscription]

      const inlineKeyboard = [
        [
          {
            text: isRu
              ? `Оплатить ${subTitle} за ${amount} р.`
              : `Pay for ${subTitle} for ${amount} RUB.`,
            url: invoiceURL,
          },
        ],
      ]

      await ctx.reply(
        isRu
          ? `<b>💵 Чек создан для подписки ${subTitle}</b>\nНажмите кнопку ниже, чтобы перейти к оплате.\n\nВ случае возникновения проблем с оплатой, пожалуйста, свяжитесь с нами @neuro_sage`
          : `<b>💵 Invoice created for subscription ${subTitle}</b>\nClick the button below to proceed with payment.\n\nIn case of payment issues, please contact us @neuro_sage`,
        {
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
          parse_mode: 'HTML',
        }
      )
      console.log('Payment message sent to user with URL button')

      return ctx.scene.leave()
    } catch (error) {
      console.error('Error in creating invoice:', error)
      await ctx.reply(
        isRu
          ? 'Ошибка при создании чека Robokassa. Пожалуйста, попробуйте снова.'
          : 'Error creating Robokassa invoice. Please try again.'
      )
      return ctx.scene.leave()
    }
  } else {
    await ctx.reply(
      isRu
        ? 'Ошибка: Не выбрана опция оплаты перед генерацией счета.'
        : 'Error: No payment option selected before generating invoice.'
    )
    return ctx.scene.leave()
  }
}

export const getRuBillWizard = new WizardScene(
  'getRuBillWizard',
  generateInvoiceStep
)

getRuBillWizard.help(handleHelpCancel)
getRuBillWizard.command('cancel', handleHelpCancel)
