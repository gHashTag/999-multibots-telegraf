import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussian } from '@/helpers'
import {
  getInvoiceId,
  merchantLogin,
  password1,
  description,
  subscriptionTitles,
} from './helper'
import { updateUserSubscription } from '@/core/supabase'
import { WizardScene } from 'telegraf/scenes'
import { getBotNameByToken } from '@/core'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'
import { createPayment } from '@/core/supabase/createPayment'
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

    // Генерируем уникальный InvId
    const invId = uuidv4()
    const numericInvId = parseInt(invId.replace(/-/g, '').slice(0, 9), 16)

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
      password1
    )
    logger.info('🔗 URL счета:', {
      description: 'Invoice URL',
      invoiceURL,
    })

    const { bot_name } = getBotNameByToken(ctx.telegram.token)

    // Сохранение платежа со статусом PENDING
    await createPayment({
      telegram_id: userId.toString(),
      amount: stars,
      OutSum: stars.toString(),
      InvId: invId,
      inv_id: invId,
      currency: 'RUB',
      stars: Number(selectedPayment.stars),
      status: 'PENDING',
      payment_method: 'Telegram',
      subscription: subscription,
      bot_name,
      description: subscription
        ? `Покупка подписки ${subscription}`
        : `Пополнение баланса на ${stars} звезд`,
      metadata: {
        payment_method: 'Telegram',
        subscription: subscription || undefined,
      },
      language: ctx.from?.language_code || 'ru',
      invoice_url: invoiceURL,
    })
    logger.info('💾 Платеж сохранен со статусом PENDING', {
      description: 'Payment saved with PENDING status',
    })

    // Формируем и отправляем сообщение с кнопкой оплаты
    const titles = subscriptionTitles(isRu)
    const subscriptionTitle = subscription ? titles[subscription] : ''

    const inlineKeyboard = [
      [
        {
          text: isRu
            ? `Купить ${subscriptionTitle} за ${stars} р.`
            : `Buy ${subscriptionTitle} for ${stars} RUB.`,
          url: invoiceURL,
        },
      ],
    ]

    await ctx.reply(
      isRu
        ? `<b>🤑 Подписка ${subscriptionTitle}</b>
          \nВ случае возникновения проблем с оплатой, пожалуйста, свяжитесь с нами @neuro_sage`
        : `<b>🤑 Subscription ${subscriptionTitle}</b>
          \nIn case of payment issues, please contact us @neuro_sage`,
      {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
        parse_mode: 'HTML',
      }
    )
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
        type: 'money_income',
        description: `RuBill payment:: ${stars}`,
        bot_name,
        inv_id: invId,
        stars: Number(stars),
      },
    })

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
  }
}

export const getRuBillWizard = new WizardScene(
  'getRuBillWizard',
  generateInvoiceStep
)
