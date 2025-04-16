import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../interfaces'
import { isRussian } from '@/helpers'
import { getUserByTelegramIdString } from '@/core/supabase'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import { TransactionType } from '@/interfaces/payments.interface'
import { inngest } from '@/inngest-functions/clients'
import { v4 as uuidv4 } from 'uuid'

export const getEnBillWizard = new Scenes.WizardScene<MyContext>(
  'getEnBillWizard',
  async ctx => {
    const isRu = isRussian(ctx)

    if (!ctx.from?.id) {
      logger.error({
        message: '❌ Ошибка идентификации пользователя',
        description: 'User identification error in getEnBillWizard',
        ctx: JSON.stringify(ctx.update || {}),
      })

      await ctx.reply(
        isRu
          ? '❌ Ошибка идентификации пользователя. Пожалуйста, попробуйте позже.'
          : '❌ User identification error. Please try again later.'
      )
      return ctx.scene.leave()
    }

    const user = await getUserByTelegramIdString(ctx.from.id.toString())
    if (!user) {
      logger.error({
        message: '❌ Пользователь не найден',
        description: 'User not found in getEnBillWizard',
        telegram_id: ctx.from.id,
      })

      await ctx.reply(
        isRu
          ? '❌ Пользователь не найден. Пожалуйста, начните с команды /start.'
          : '❌ User not found. Please start with the /start command.'
      )
      return ctx.scene.leave()
    }

    // Получаем выбранный платеж из сессии
    const selectedPayment = ctx.session.selectedPayment
    if (!selectedPayment) {
      logger.error({
        message: '❌ Данные о платеже не найдены',
        description: 'Payment data not found in getEnBillWizard',
        telegram_id: ctx.from.id,
      })

      await ctx.reply(
        isRu
          ? '❌ Данные о платеже не найдены. Пожалуйста, выберите подписку заново.'
          : '❌ Payment data not found. Please select a subscription again.'
      )
      return ctx.scene.enter(ModeEnum.SubscriptionScene)
    }

    const { amount, stars, subscription } = selectedPayment

    // Формируем сообщение с инструкциями по оплате
    const paymentMessage = `💳 ${
      isRu
        ? `Оплата подписки в долларах ($${amount})`
        : `Subscription payment in dollars ($${amount})`
    }

${
  isRu
    ? `📝 Для оплаты подписки, пожалуйста, выполните следующие шаги:

1️⃣ Используйте одну из следующих платежных систем:
   - Stripe
   - PayPal
   - Credit/Debit Card

2️⃣ После оплаты, вы получите ${stars} звезд на баланс.
   
3️⃣ Обработка платежа может занять до 5 минут.`
    : `📝 To pay for your subscription, please follow these steps:

1️⃣ Use one of the following payment systems:
   - Stripe
   - PayPal
   - Credit/Debit Card

2️⃣ After payment, you will receive ${stars} stars to your balance.
   
3️⃣ Payment processing may take up to 5 minutes.`
}

${
  isRu
    ? '❓ Нажмите кнопку ниже, чтобы перейти к оплате, или выберите "Отмена" для возврата в меню.'
    : '❓ Click the button below to proceed with the payment, or select "Cancel" to return to the menu.'
}`

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.url(
          isRu ? '💳 Перейти к оплате' : '💳 Proceed to payment',
          `https://buy.stripe.com/test_payment/${subscription}/${amount}/${ctx.from.id}`
        ),
      ],
      [
        Markup.button.callback(
          isRu ? '❌ Отмена' : '❌ Cancel',
          'cancel_payment'
        ),
      ],
    ])

    await ctx.reply(paymentMessage, keyboard)

    logger.info({
      message: '💳 Запрос на оплату подписки отправлен',
      description: 'Subscription payment request sent',
      telegram_id: ctx.from.id,
      subscription,
      amount,
      stars,
    })

    return ctx.wizard.next()
  },
  async ctx => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      await ctx.reply('❌ Invalid callback query')
      return ctx.scene.leave()
    }

    const data = ctx.callbackQuery.data
    if (data === 'cancel_payment') {
      const isRu = isRussian(ctx)
      await ctx.reply(
        isRu
          ? '🔄 Оплата отменена. Возвращаемся в главное меню.'
          : '🔄 Payment canceled. Returning to the main menu.'
      )
      return ctx.scene.enter(ModeEnum.MainMenu)
    }

    // Для тестовых целей можно добавить автоматическое подтверждение платежа для админов
    const adminIds = process.env.ADMIN_IDS
      ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id, 10))
      : []

    if (
      ctx.from?.id &&
      adminIds.includes(ctx.from.id) &&
      data === 'test_payment_success'
    ) {
      const selectedPayment = ctx.session.selectedPayment
      if (selectedPayment) {
        const { amount, stars, subscription } = selectedPayment

        // Отправляем событие обработки платежа
        await inngest.send({
          id: `subscription-${ctx.from.id}-${Date.now()}-${uuidv4()}`,
          name: 'payment/process',
          data: {
            telegram_id: ctx.from.id.toString(),
            amount: stars,
            type: TransactionType.MONEY_INCOME,
            description: `Subscription payment: ${subscription}`,
            bot_name: ctx.botInfo.username,
            metadata: {
              service_type: ModeEnum.Subscribe,
              subscription,
              amount,
            },
          },
        })

        const isRu = isRussian(ctx)
        await ctx.reply(
          isRu
            ? `✅ Оплата успешно обработана! На ваш баланс начислено ${stars} звезд.`
            : `✅ Payment successfully processed! ${stars} stars have been added to your balance.`
        )
      }

      return ctx.scene.enter(ModeEnum.MainMenu)
    }

    // Обычно здесь мы бы ждали вебхук от платежной системы
    return ctx.wizard.next()
  }
)
