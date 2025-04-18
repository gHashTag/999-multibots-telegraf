import { MyContext } from '../../interfaces'
import { isRussian } from '@/helpers'
import { handleHelpCancel } from '@/handlers'
import { paymentOptions } from '../getRuBillWizard/helper'
import { WizardScene } from 'telegraf/scenes'

export const selectPaymentOptionStep = async (ctx: MyContext) => {
  console.log('CASE 3: selectPaymentOptionStep')
  const isRu = isRussian(ctx)
  const msg = ctx.message
  const subscription = ctx.session.subscription
  if (msg && 'text' in msg) {
    const selectedOption = msg.text
    console.log('Selected option:', selectedOption)

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
      ctx.session.selectedPayment = selectedPayment
      await ctx.scene.enter('getRuBillWizard')
      return
    } else {
      console.log('Invalid payment option selected')
      await ctx.reply(
        isRu
          ? 'Пожалуйста, выберите корректную сумму.'
          : 'Please select a valid amount.'
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
