import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussian } from '@/helpers'
import {
  getInvoiceId,
  merchantLogin,
  password1,
  description,
  generateShortInvId,
  useTestMode,
} from '@/scenes/getRuBillWizard/helper'
import { updateUserSubscription } from '@/core/supabase'
import { WizardScene } from 'telegraf/scenes'
import { getBotNameByToken } from '@/core'
import { TransactionType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { inngest } from '@/inngest-functions/clients'
import { ModeEnum } from '@/interfaces/modes'
import { type LocalSubscription } from '@/types/subscription'
import { getRuBillMessage } from '@/utils/getRuBillMessage'

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
    await ctx.reply(
      isRu
        ? 'Пожалуйста, сначала выберите способ оплаты'
        : 'Please select a payment method first'
    )
    return ctx.scene.leave()
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

  // Проверка на валидный тип подписки
  if (subscription && !['neurophoto', 'neurobase'].includes(subscription)) {
    logger.error('❌ Неверный тип подписки', {
      description: 'Invalid subscription type',
      subscription,
    })
    await ctx.reply(
      isRu
        ? 'Выбран неверный тип подписки. Пожалуйста, попробуйте снова.'
        : 'Invalid subscription type selected. Please try again.'
    )
    return ctx.scene.leave()
  }

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

    // Получение invoiceID - ВСЕГДА передаем параметр тестового режима
    const invoiceURL = await getInvoiceId(
      merchantLogin,
      stars,
      numericInvId,
      description,
      password1,
      useTestMode
    )

    // Дополнительная проверка URL-адреса на корректный домен
    const finalInvoiceURL = invoiceURL.includes('test.robokassa.ru')
      ? invoiceURL
      : invoiceURL.replace(
          'https://auth.robokassa.ru/Merchant/Index.aspx',
          'https://test.robokassa.ru/Index.aspx'
        )

    if (finalInvoiceURL !== invoiceURL) {
      logger.warn('⚠️ URL был исправлен для тестового режима:', {
        description: 'URL was corrected for test mode in getRuBillWizard',
        originalUrl: invoiceURL,
        correctedUrl: finalInvoiceURL,
      })
    }

    logger.info('🔗 URL счета:', {
      description: 'Invoice URL',
      invoiceURL: finalInvoiceURL,
      isTestMode: useTestMode,
      domainUsed: finalInvoiceURL.includes('test.robokassa.ru')
        ? 'test.robokassa.ru'
        : 'auth.robokassa.ru',
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
        payment_method: 'Robokassa',
        subscription: subscription,
        currency: 'RUB',
        invoice_url: finalInvoiceURL,
        service_type: subscription ? ModeEnum.Subscribe : ModeEnum.TopUpBalance,
        status: 'PENDING',
      },
    })

    // Формируем и отправляем сообщение с кнопкой оплаты
    const { messageText, inlineKeyboard } = getRuBillMessage({
      stars,
      subscription,
      isRu,
      invoiceURL: finalInvoiceURL,
    })

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
        subscription,
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
