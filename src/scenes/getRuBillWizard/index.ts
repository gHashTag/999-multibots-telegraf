import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussian } from '@/helpers'
import {
  getInvoiceId,
  merchantLogin,
  password1,
  description,
  subscriptionTitles,
  useTestMode,
  generateShortInvId,
} from './helper'
import { updateUserSubscription } from '@/core/supabase'
import { WizardScene } from 'telegraf/scenes'
import { getBotNameByToken } from '@/core'
import { TransactionType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'
import { ModeEnum } from '@/interfaces/modes'

type Subscription = 'neurophoto' | 'neurobase' | 'neuroblogger'

// Экспортируем тип для подписок
export type LocalSubscription = Extract<
  Subscription,
  'neurophoto' | 'neurobase' | 'neuroblogger'
>

const generateInvoiceStep = async (ctx: MyContext) => {
  logger.info('🚀 Начало создания счета', {
    description: 'Starting invoice generation',
  })

  const isRu = isRussian(ctx)
  const selectedPayment = ctx.session.selectedPayment

  if (!selectedPayment) {
    logger.error('❌ Не выбран способ оплаты', {
      description: 'Payment method not selected',
    })
    return
  }

  const email = ctx.session.email
  logger.info('📧 Email получен из сессии:', {
    description: 'Email from session',
    email,
  })

  const stars = selectedPayment.amount
  const subscription = selectedPayment.subscription as Subscription | undefined

  try {
    const userId = ctx.from?.id
    if (!userId) {
      throw new Error('User ID not found')
    }

    logger.info('👤 ID пользователя:', {
      description: 'User ID',
      userId,
    })

    // Генерируем короткий InvId для Robokassa
    const numericInvId = await generateShortInvId(userId, stars)
    const invId = numericInvId.toString()

    logger.info('🔢 Сгенерирован ID счета:', {
      description: 'Generated invoice ID',
      invId,
      numericInvId,
    })
    if (!merchantLogin || !password1) {
      throw new Error('merchantLogin or password1 is not defined')
    }

    // Получение invoiceID
    const invoiceURL = await getInvoiceId(
      merchantLogin,
      stars,
      numericInvId,
      description,
      password1,
      useTestMode
    )
    logger.info('🔗 URL счета:', {
      description: 'Invoice URL',
      invoiceURL,
    })

    const { bot_name } = getBotNameByToken(ctx.telegram.token)

    // Отправляем событие для создания платежа
    logger.info('✅ Обработка платежа в RuBillWizard:', {
      description: 'Processing payment in RuBillWizard',
      telegram_id: userId,
      amount: stars,
      inv_id: invId,
    })

    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: String(userId),
        amount: Number(stars),
        type: TransactionType.MONEY_INCOME,
        description: subscription
          ? `Покупка подписки ${subscription}`
          : `Пополнение баланса на ${stars} звезд`,
        bot_name,
        inv_id: invId,
        stars: Number(stars),
        payment_method: 'Telegram',
        subscription: subscription,
        currency: 'RUB',
        invoice_url: invoiceURL,
        service_type: subscription ? ModeEnum.Subscribe : ModeEnum.TopUpBalance,
        status: 'PENDING',
      },
    })

    // Формируем и отправляем сообщение с кнопкой оплаты
    const titles = subscriptionTitles(isRu)
    const subscriptionTitle = subscription ? titles[subscription] : ''

    const inlineKeyboard = [
      [
        {
          text: isRu ? 'Оплатить' : 'Pay',
          url: invoiceURL,
        },
      ],
    ]

    const messageText = isRu
      ? `<b>💳 ${subscription ? `Подписка ${subscriptionTitle}` : 'Пополнение баланса'}</b>\n` +
        `<b>💰 Сумма:</b> ${stars} ₽\n` +
        `<i>При проблемах с оплатой: @neuro_sage</i>`
      : `<b>💳 ${subscription ? `Subscription ${subscriptionTitle}` : 'Balance top-up'}</b>\n` +
        `<b>💰 Amount:</b> ${stars} RUB\n` +
        `<i>Payment support: @neuro_sage</i>`

    await ctx.reply(messageText, {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
      parse_mode: 'HTML',
    })
    logger.info('✉️ Сообщение об оплате отправлено пользователю', {
      description: 'Payment message sent to user',
    })

    // Обновление подписки пользователя
    if (subscription) {
      await updateUserSubscription(userId.toString(), subscription)
      logger.info('✅ Подписка пользователя обновлена', {
        description: 'User subscription updated',
      })
    }

    ctx.session.selectedPayment = {
      amount: selectedPayment.amount,
      stars: Number(selectedPayment.stars),
      subscription: selectedPayment.subscription as LocalSubscription,
      type: TransactionType.SUBSCRIPTION_PURCHASE,
    }

    return ctx.scene.leave()
  } catch (error) {
    logger.error('❌ Ошибка при создании счета:', {
      description: 'Error creating invoice',
      error: error instanceof Error ? error.message : String(error),
    })
    await ctx.reply(
      isRu
        ? 'Ошибка при создании чека. Пожалуйста, попробуйте снова.'
        : 'Error creating invoice. Please try again.'
    )
    ctx.scene.leave()
    return
  }
}

export const getRuBillWizard = new WizardScene(
  'getRuBillWizard',
  generateInvoiceStep
)
