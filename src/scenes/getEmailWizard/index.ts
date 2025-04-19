import { MyContext } from '../../interfaces'
import { isRussian } from '@/helpers'
import { handleHelpCancel } from '@/handlers'
import { paymentOptions } from '../getRuBillWizard/helper'
import { WizardScene } from 'telegraf/scenes'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { TransactionType } from '@/interfaces/payments.interface'

const selectPaymentOptionStep = async (ctx: MyContext) => {
  console.log('CASE 3: selectPaymentOptionStep')
  const isRu = isRussian(ctx)
  const msg = ctx.message
  const subscription = ctx.session.subscription
  if (msg && 'text' in msg) {
    const selectedOptionText = msg.text
    console.log('Selected option text:', selectedOptionText)

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      console.log('Payment cancelled by user')
      return ctx.scene.leave()
    }

    const selectedPayment = paymentOptions.find(
      option => option.subscription === subscription
    )

    if (selectedPayment) {
      console.log('Selected payment option:', selectedPayment)
      ctx.session.selectedPayment = {
        amount: selectedPayment.amount,
        stars: parseInt(selectedPayment.stars, 10),
        subscription: selectedPayment.subscription,
        type: TransactionType.SUBSCRIPTION_PURCHASE,
      }
      await ctx.scene.enter('getRuBillWizard')
      return
    } else {
      console.log(
        'Invalid payment option selected or subscription type mismatch'
      )
      await ctx.reply(
        isRu
          ? 'Ошибка выбора опции. Попробуйте вернуться в меню подписок.'
          : 'Error selecting option. Try returning to the subscription menu.'
      )
    }
  } else {
    console.log('No valid text message found')
    return ctx.scene.leave()
  }
}

export const getEmailWizard = new WizardScene(
  'getEmailWizard',
  selectPaymentOptionStep
)
