import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { handleHelpCancel } from '@/navigation'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { getInvoiceId, description, subscriptionTitles } from './helper'
import { getMerchantLogin, getRobokassaPassword1 } from '@/config'
import { setPayments } from '@/core/supabase'
import { Scenes } from 'telegraf'

/**
 * Уникальный InvId для Robokassa.
 *
 * `Date.now() % 2147483647` сам по себе НЕ уникален: два счёта, созданных в
 * одну миллисекунду, получали одинаковый InvId — а для Robokassa это один и
 * тот же счёт, то есть два платежа сливаются в один. Счётчик гарантирует
 * строгий рост в пределах процесса, оставаясь в допустимом диапазоне
 * 1..2147483647.
 */
let lastInvoiceId = 0
function nextInvoiceId(): number {
  const candidate = Date.now() % 2147483647
  lastInvoiceId =
    candidate > lastInvoiceId ? candidate : (lastInvoiceId % 2147483646) + 1
  return lastInvoiceId
}
import { getBotNameByToken } from '@/core'
import { logger } from '@/utils/logger'
import {
  Currency,
  PaymentStatus,
  PaymentType,
} from '@/interfaces/payments.interface'
import { supportMention } from '@/config/support'

export const generateInvoiceStep = async (ctx: MyContext) => {
  console.log('═══════════════════════════════════════════════════════')
  console.log('💳 [getRuBillWizard] STARTING PAYMENT FLOW')
  console.log('═══════════════════════════════════════════════════════')

  logger.info('### getRuBillWizard ENTERED (generateInvoiceStep) ###', {
    scene: 'getRuBillWizard',
    step: 'generateInvoiceStep',
    telegram_id: ctx.from?.id,
  })

  // ✅ LAZY: Получаем credentials в момент вызова (после загрузки Infisical)
  const merchantLogin = getMerchantLogin() || ''
  const password1 = getRobokassaPassword1() || ''

  console.log('🔐 [getRuBillWizard] Credentials check:', {
    hasMerchantLogin: !!merchantLogin,
    merchantLoginPreview: merchantLogin
      ? `${merchantLogin.substring(0, 5)}...`
      : 'MISSING',
    hasPassword1: !!password1,
    password1Preview: password1 ? `${password1.substring(0, 5)}...` : 'MISSING',
  })

  if (!merchantLogin || !password1) {
    console.error(
      '❌ [getRuBillWizard] CRITICAL: Missing Robokassa credentials!'
    )
    const isRu = isRussian(ctx)
    await ctx.reply(
      isRu
        ? '❌ Ошибка конфигурации платежной системы. Обратитесь в поддержку ' +
            supportMention()
        : '❌ Payment system configuration error. Contact support ' +
            supportMention()
    )
    return ctx.scene.leave()
  }

  const isRu = isRussian(ctx)
  const selectedPayment = ctx.session.selectedPayment
  console.log('📦 [getRuBillWizard] Selected payment:', selectedPayment)
  if (selectedPayment) {
    const email = ctx.session.email
    console.log('Email from session:', email)

    const subscription = selectedPayment.subscription.toLowerCase()
    let amount: number
    let stars: number
    if (subscription === SubscriptionType.BASIC.toLowerCase()) {
      amount = 299
      stars = 130
    } else if (subscription === SubscriptionType.PRO.toLowerCase()) {
      amount = 699
      stars = 304
    } else if (subscription === SubscriptionType.STUDIO.toLowerCase()) {
      amount = 1999
      stars = 869
    } else if (subscription === SubscriptionType.NEUROPHOTO.toLowerCase()) {
      amount = 1110 // Legacy: НейроФото
      stars = 476
    } else if (subscription === SubscriptionType.NEUROVIDEO.toLowerCase()) {
      amount = 2999 // Legacy: НейроВидео
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

      // ✅ ИСПРАВЛЕНИЕ: Используем Date.now() для уникального возрастающего InvId
      // Robokassa требует уникальный InvId как счётчик (1 <= InvId <= 2147483647)
      const invId = nextInvoiceId()
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

      let subTypeEnum: SubscriptionType | null = null
      const subLower = subscription.toLowerCase()
      if (subLower === SubscriptionType.BASIC.toLowerCase()) {
        subTypeEnum = SubscriptionType.BASIC
      } else if (subLower === SubscriptionType.PRO.toLowerCase()) {
        subTypeEnum = SubscriptionType.PRO
      } else if (subLower === SubscriptionType.STUDIO.toLowerCase()) {
        subTypeEnum = SubscriptionType.STUDIO
      } else if (subLower === SubscriptionType.NEUROPHOTO.toLowerCase()) {
        subTypeEnum = SubscriptionType.NEUROPHOTO
      } else if (subLower === SubscriptionType.NEUROVIDEO.toLowerCase()) {
        subTypeEnum = SubscriptionType.NEUROVIDEO
      }

      if (!subTypeEnum) {
        logger.error(
          'Could not determine SubscriptionType enum for:',
          subscription
        )
        await ctx.reply(
          isRu
            ? 'Ошибка: Не удалось определить тип подписки для записи.'
            : 'Error: Could not determine subscription type for record.'
        )
        return ctx.scene.leave()
      }

      try {
        await setPayments({
          telegram_id: userId.toString(),
          OutSum: amount.toString(),
          InvId: invId.toString(),
          currency: Currency.RUB,
          stars: stars,
          status: PaymentStatus.PENDING,
          payment_method: 'Robokassa',
          type: PaymentType.MONEY_INCOME,
          subscription_type: subTypeEnum,
          bot_name,
          language: ctx.from?.language_code ?? 'en',
        })
        console.log('Payment saved with status PENDING')
        logger.info('Pending payment record created for Robokassa', {
          userId,
          invId,
          subscription_type: subTypeEnum,
        })
      } catch (error) {
        console.error('Error in setting payments:', error)
        logger.error('Error saving pending Robokassa payment', {
          error,
          userId,
          invId,
        })
        await ctx.reply(
          isRu
            ? 'Ошибка при создании платежа в базе данных. Пожалуйста, попробуйте снова.'
            : 'Error creating payment in database. Please try again.'
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
          ? `<b>💵 Чек создан для подписки ${subTitle}</b>\nНажмите кнопку ниже, чтобы перейти к оплате.\n\nВ случае возникновения проблем с оплатой, пожалуйста, свяжитесь с нами ${supportMention()}`
          : `<b>💵 Invoice created for subscription ${subTitle}</b>\nClick the button below to proceed with payment.\n\nIn case of payment issues, please contact us ${supportMention()}`,
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

export const getRuBillWizard = new Scenes.WizardScene(
  'getRuBillWizard',
  generateInvoiceStep
)

getRuBillWizard.help(ctx => handleHelpCancel(ctx))
getRuBillWizard.command('cancel', ctx => handleHelpCancel(ctx))
