import { Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { saveUserEmail } from '../../core/supabase'
import { isRussian } from '@/helpers'
import { handleHelpCancel } from '@/handlers'
import { paymentOptions, subscriptionTitles } from '../getRuBillWizard/helper'
import { WizardScene } from 'telegraf/scenes'

const enterStep = async (ctx: MyContext) => {
  console.log('CASE: enterStep')
  const isRu = isRussian(ctx)
  const email = ctx.session.email

  if (!email) {
    await ctx.reply(
      isRu
        ? '👉 Для формирования счета напишите ваш E-mail.'
        : '👉 To generate an invoice, please provide your E-mail.',
      Markup.keyboard([Markup.button.text(isRu ? 'Отмена' : 'Cancel')]).resize()
    )
    ctx.wizard.next()
  } else {
    ctx.scene.leave()
  }
}

const emailStep = async (ctx: MyContext) => {
  console.log('CASE: emailStep')
  const isRu = isRussian(ctx)
  if (!ctx.message || !('text' in ctx.message)) {
    await ctx.reply(
      isRu ? 'Пожалуйста, введите ваш E-mail.' : 'Please enter your E-mail.'
    )
    return
  }
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
        ? `Купить ${subscriptionTitles(isRu)[option.subscription]}⭐️ за ${
            option.amount
          } р`
        : `Buy ${subscriptionTitles(isRu)[option.subscription]}⭐️ for ${
            option.amount
          } RUB`,
    ])

    const keyboard = Markup.keyboard(buttons).resize()

    await ctx.reply(
      isRu ? 'Выберите сумму для оплаты:' : 'Choose the amount for payment:',
      {
        reply_markup: keyboard.reply_markup,
      }
    )
    ctx.wizard.next()
  } catch (error) {
    await ctx.reply(
      isRu
        ? 'Ошибка при сохранении e-mail. Пожалуйста, попробуйте снова.'
        : 'Error saving e-mail. Please try again.'
    )
  }
}

const selectPaymentOptionStep = async (ctx: MyContext) => {
  console.log('CASE: selectPaymentOptionStep')
  const isRu = isRussian(ctx)
  const msg = ctx.message

  if (msg && 'text' in msg) {
    const selectedOption = msg.text
    console.log('Selected option:', selectedOption)

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      console.log('Payment cancelled by user')
      return ctx.scene.leave()
    }

    const selectedPayment = paymentOptions.find(option =>
      selectedOption.includes(option.amount.toString())
    )

    if (selectedPayment) {
      console.log('Selected payment option:', selectedPayment)
      ctx.session.selectedPayment = selectedPayment
      await ctx.scene.enter('getRuBill')
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
  }
}

export const getEmailWizard = new WizardScene(
  'getEmailWizard',
  enterStep,
  emailStep,
  selectPaymentOptionStep
)
