import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussian } from '@/helpers'
import {
  getInvoiceId,
  merchantLogin,
  password1,
  description,
  subscriptionTitles,
} from './helper'
import { setPayments, updateUserSubscription } from '../../core/supabase'
import { WizardScene } from 'telegraf/scenes'
import { getBotNameByToken } from '@/core'
import { v4 as uuidv4 } from 'uuid'
const generateInvoiceStep = async (ctx: MyContext) => {
  console.log('🚀 Starting generateInvoiceStep')
  const isRu = isRussian(ctx)
  const selectedPayment = ctx.session.selectedPayment

  if (selectedPayment) {
    const email = ctx.session.email
    console.log('📧 Email from session:', email)

    const stars = selectedPayment.amount
    const subscription = selectedPayment.subscription

    try {
      const userId = ctx.from?.id
      console.log('👤 User ID:', userId)

      // Генерируем уникальный InvId
      const invId = uuidv4()
      console.log('🔢 Generated invoice ID:', invId)

      // Получение invoiceID
      const invoiceURL = await getInvoiceId(
        merchantLogin,
        stars,
        Number(invId),
        description,
        password1
      )
      console.log('🔗 Invoice URL:', invoiceURL)

      const { bot_name } = getBotNameByToken(ctx.telegram.token)

      // Сохранение платежа со статусом PENDING
      await setPayments({
        telegram_id: userId.toString(),
        OutSum: stars.toString(),
        InvId: invId.toString(),
        currency: 'STARS',
        stars: Number(selectedPayment.stars),
        status: 'PENDING',
        email: email,
        payment_method: 'Telegram',
        subscription: subscription,
        bot_name,
        language: ctx.from?.language_code,
      })
      console.log('💾 Payment saved with status PENDING')

      // Формируем и отправляем сообщение с кнопкой оплаты
      const inlineKeyboard = [
        [
          {
            text: isRu
              ? `Купить ${
                  subscriptionTitles(isRu)[subscription]
                } за ${stars} р.`
              : `Buy ${
                  subscriptionTitles(isRu)[subscription]
                } for ${stars} RUB.`,
            url: invoiceURL,
          },
        ],
      ]

      await ctx.reply(
        isRu
          ? `<b>🤑 Подписка ${subscriptionTitles(isRu)[subscription]}</b>
            \nВ случае возникновения проблем с оплатой, пожалуйста, свяжитесь с нами @neuro_sage`
          : `<b>🤑 Subscription ${subscriptionTitles(isRu)[subscription]}</b>
            \nIn case of payment issues, please contact us @neuro_sage`,
        {
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
          parse_mode: 'HTML',
        }
      )
      console.log('✉️ Payment message sent to user')

      // Обновление подписки пользователя
      await updateUserSubscription(userId.toString(), subscription)
      console.log('✅ User subscription updated')

      return ctx.scene.leave()
    } catch (error) {
      console.error('❌ Error in creating invoice:', error)
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
