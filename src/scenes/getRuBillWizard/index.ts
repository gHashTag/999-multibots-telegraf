import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussian } from '@/helpers'
import {
  getInvoiceId,
  merchantLogin,
  password1,
  description,
  subscriptionTitles,
} from './helper'
import {
  setPayments,
  updateUserSubscription,
  getUserBalance,
} from '@/core/supabase'
import { WizardScene } from 'telegraf/scenes'
import { getBotNameByToken } from '@/core'

import { logger } from '@/utils/logger'
import { generateInvId } from '@/utils/generateInvId'
import { Subscription } from '@/interfaces/supabase.interface'
import { ModeEnum } from '@/interfaces/modes.interface'

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
  const subscription = selectedPayment.subscription as
    | LocalSubscription
    | undefined

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
    const invId = generateInvId(userId, stars)
    const numericInvId = parseInt(invId.split('-')[0]) // Используем timestamp как числовой ID

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
    await setPayments({
      telegram_id: userId.toString(),
      OutSum: stars.toString(),
      InvId: invId,
      inv_id: invId,
      currency: 'RUB',
      stars: Number(selectedPayment.stars),
      status: 'PENDING',
      email: email || undefined,
      payment_method: 'Telegram',
      subscription: subscription,
      bot_name,
      description: subscription
        ? `Покупка подписки ${subscription}`
        : `Пополнение баланса на ${stars} звезд`,
      metadata: {
        payment_method: 'Telegram',
        subscription: subscription || undefined,
        stars: Number(selectedPayment.stars),
      },
      language: ctx.from?.language_code || 'ru',
      invoice_url: invoiceURL,
      type: 'money_expense',
      service_type: ModeEnum.NeuroPhoto,
    })
    logger.info('💾 Платеж сохранен со статусом PENDING', {
      description: 'Payment saved with PENDING status',
    })

    // Получаем текущий баланс пользователя
    const balance = await getUserBalance(userId.toString(), bot_name)
    logger.info('💰 Текущий баланс пользователя:', {
      description: 'Current user balance',
      balance,
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

    // Отправляем информацию о цене и балансе
    await ctx.reply(
      isRu
        ? `⭐️ Цена: ${stars} звезд\n💰 Баланс: ${balance} звезд`
        : `⭐️ Price: ${stars} stars\n💰 Balance: ${balance} stars`
    )
    logger.info('💫 Информация о цене и балансе отправлена', {
      description: 'Price and balance information sent',
      stars,
      balance,
    })

    // Обновление подписки пользователя
    if (subscription) {
      await updateUserSubscription(userId.toString(), subscription)
      logger.info('✅ Подписка пользователя обновлена', {
        description: 'User subscription updated',
      })
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
  }
}

export const getRuBillWizard = new WizardScene(
  'getRuBillWizard',
  generateInvoiceStep
)
