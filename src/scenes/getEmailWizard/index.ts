import { MyContext } from '../../interfaces'
import { isRussian } from '@/helpers'
import { handleHelpCancel } from '@/handlers'
import { paymentOptionsPlans } from '@/price/priceCalculator'
import { WizardScene } from 'telegraf/scenes'
import { LocalSubscription } from '@/scenes/getRuBillWizard'
const selectPaymentOptionStep = async (ctx: MyContext) => {
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

    const selectedPayment = paymentOptionsPlans.find(
      option => option.subscription === subscription
    )

    if (selectedPayment) {
      console.log('Selected payment option:', selectedPayment)
      ctx.session.selectedPayment = {
        amount: selectedPayment.amount,
        stars: Number(selectedPayment.stars),
        subscription: selectedPayment.subscription as LocalSubscription,
      }
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
