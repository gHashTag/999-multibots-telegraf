import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussian } from '@/helpers'
import { handleSelectStars } from '@/handlers/handleSelectStars'
import { handleBuySubscription } from '@/handlers/handleBuySubscription'
import { ModeEnum } from '@/interfaces/modes'
import { createPendingPayment } from '@/core/supabase/createPendingPayment'
import { MERCHANT_LOGIN } from '@/config'
import { generateShortInvId } from '@/utils/generateShortInvId'
import { getInvoiceId } from '@/scenes/getRuBillWizard/helper'
import { paymentOptions } from '@/price/priceCalculator'
import { TransactionType } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { SUBSCRIPTION_CONFIG } from '@/config/subscription.config'

const merchantLogin = MERCHANT_LOGIN
const password1 = process.env.ROBOKASSA_PASSWORD1 || ''

// В начале файла добавим проверку конфигурации
if (!merchantLogin) {
  throw new Error('MERCHANT_LOGIN is not defined in environment variables')
}

export const paymentScene = new Scenes.BaseScene<MyContext>('paymentScene')

paymentScene.enter(async (ctx: MyContext) => {
  const isRu = isRussian(ctx)
  try {
    logger.info('🎭 Entering payment scene', {
      telegram_id: ctx.from?.id,
      selectedPayment: ctx.session.selectedPayment,
      mode: ctx.session.selectedPayment?.type,
      current_scene: ctx.scene?.current?.id,
    })

    // Показываем меню выбора способа оплаты
    await ctx.reply(
      isRu ? 'Как вы хотите оплатить?' : 'How do you want to pay?',
      Markup.keyboard([
        [
          Markup.button.text(isRu ? '⭐️ Звездами' : '⭐️ Stars'),
          {
            text: isRu ? 'Что такое звезды❓' : 'What are stars❓',
            web_app: {
              url: `https://telegram.org/blog/telegram-stars/${isRu ? 'ru' : 'en'}?ln=a`,
            },
          },
        ],
        [
          Markup.button.text(isRu ? '💳 Рублями' : '💳 In rubles'),
          Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu'),
        ],
      ]).resize()
    )

    logger.info('✅ Payment options displayed', {
      telegram_id: ctx.from?.id,
      subscription: ctx.session.subscription,
    })
  } catch (error) {
    logger.error('❌ Error in payment scene:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id: ctx.from?.id,
      selectedPayment: ctx.session.selectedPayment,
    })

    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
        : '❌ An error occurred. Please try again later or contact support.'
    )

    await ctx.scene.leave()
  }
})

paymentScene.hears(['⭐️ Звездами', '⭐️ Stars'], async ctx => {
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription

  try {
    logger.info('⭐️ Processing stars payment', {
      telegram_id: ctx.from?.id,
      subscription,
      current_scene: ctx.scene?.current?.id,
    })

    if (subscription) {
      if (
        subscription === SubscriptionType.NEUROBASE ||
        subscription === SubscriptionType.NEUROPHOTO ||
        subscription === SubscriptionType.NEUROBLOGGER
      ) {
        await handleBuySubscription(ctx, subscription)
        await ctx.scene.leave()
      } else {
        await handleSelectStars({ ctx, isRu, paymentOptions })
        await ctx.scene.leave()
      }
    } else {
      await handleSelectStars({ ctx, isRu, paymentOptions })
      await ctx.scene.leave()
    }

    logger.info('✅ Stars payment processed successfully', {
      telegram_id: ctx.from?.id,
      subscription,
    })
  } catch (error) {
    logger.error('❌ Error processing stars payment:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id: ctx.from?.id,
      subscription,
    })

    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при обработке оплаты звездами. Попробуйте позже.'
        : '❌ Error processing stars payment. Please try again later.'
    )
  }
})

paymentScene.hears(['💳 Рублями', '💳 In rubles'], async ctx => {
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription

  if (!ctx.from) {
    throw new Error('User not found')
  }

  if (!ctx.botInfo?.username) {
    throw new Error('Bot username is not defined')
  }

  try {
    logger.info('💳 Processing ruble payment', {
      telegram_id: ctx.from.id,
      subscription,
      current_scene: ctx.scene?.current?.id,
    })

    if (subscription && subscription !== SubscriptionType.NEUROTESTER) {
      const subscriptionInfo = SUBSCRIPTION_CONFIG[subscription]
      const price = isRu ? subscriptionInfo.price_ru : subscriptionInfo.price_en
      const stars = subscriptionInfo.stars
      const title = isRu ? subscriptionInfo.title_ru : subscriptionInfo.title_en

      const invId = generateShortInvId()
      const description = `Subscription ${title}`

      const paymentUrl = await getInvoiceId(
        merchantLogin,
        price,
        invId,
        description,
        password1
      )

      await createPendingPayment({
        telegram_id: ctx.from.id.toString(),
        amount: price,
        stars,
        type: TransactionType.SUBSCRIPTION_PURCHASE,
        description,
        bot_name: ctx.botInfo.username,
        service_type: ModeEnum.Subscribe,
        inv_id: invId.toString(),
        invoice_url: paymentUrl,
        metadata: {
          subscription_type: subscription,
          payment_method: 'Robokassa',
        },
      })

      await ctx.reply(
        isRu
          ? `💫 Подписка ${title}\n💰 Стоимость: ${price} RUB\n⭐️ Бонус: ${stars} звезд`
          : `💫 Subscription ${title}\n💰 Price: ${price} RUB\n⭐️ Bonus: ${stars} stars`,
        Markup.inlineKeyboard([
          [Markup.button.url(isRu ? '💳 Оплатить' : '💳 Pay', paymentUrl)],
        ])
      )

      logger.info('✅ Ruble payment processed successfully', {
        telegram_id: ctx.from.id,
        subscription,
        price,
        stars,
      })
    } else {
      await handleSelectStars({ ctx, isRu, paymentOptions })
    }
  } catch (error) {
    logger.error('❌ Error in ruble payment processing:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      telegram_id: ctx.from?.id,
      subscription,
    })

    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при создании платежа. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
        : '❌ An error occurred while creating the payment. Please try again later or contact support.'
    )
  }
})

// Добавляем обработчик для выбора суммы пополнения в рублях
paymentScene.action(/pay_rub_(\d+)_(\d+)/, async ctx => {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return
  }

  const isRu = isRussian(ctx)

  if (!ctx.from || !ctx.botInfo?.username) {
    await ctx.answerCbQuery('Error: User or bot data missing')
    return
  }

  try {
    // Получаем сумму и звезды из callback данных
    const match = ctx.callbackQuery.data.match(/pay_rub_(\d+)_(\d+)/)
    if (!match) {
      await ctx.answerCbQuery('Invalid data')
      return
    }

    const amount = parseInt(match[1])
    const stars = parseInt(match[2])

    // Создаем платеж
    const userId = ctx.from.id
    const invId = generateShortInvId()
    const description = isRu ? 'Пополнение баланса' : 'Balance replenishment'
    const numericInvId = Number(invId)

    if (!merchantLogin || !password1) {
      throw new Error('merchantLogin or password1 is not defined')
    }

    // Получение invoiceID
    const paymentUrl = await getInvoiceId(
      merchantLogin,
      amount,
      numericInvId,
      description,
      password1
    )

    // Создаем платеж в статусе PENDING
    await createPendingPayment({
      telegram_id: userId.toString(),
      amount,
      stars,
      inv_id: numericInvId.toString(),
      description,
      bot_name: ctx.botInfo.username,
      language: ctx.from.language_code || 'ru',
      invoice_url: paymentUrl,
      service_type: ModeEnum.TopUpBalance,
      type: TransactionType.MONEY_INCOME,
      metadata: {
        payment_method: 'Robokassa',
        subscription: 'stars',
      },
    })

    // Удаляем сообщение с выбором суммы
    await ctx.deleteMessage()

    // Отправляем новое сообщение с ссылкой на оплату
    await ctx.reply(
      isRu
        ? `<b>💵 Пополнение баланса на ${amount} р (${stars}⭐)</b>\nНажмите на кнопку ниже, чтобы перейти к оплате. После успешной оплаты звезды автоматически будут зачислены на ваш баланс.`
        : `<b>💵 Balance top-up for ${amount} RUB (${stars}⭐)</b>\nClick the button below to proceed with payment. After successful payment, stars will be automatically credited to your balance.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: isRu ? `Оплатить ${amount} р` : `Pay ${amount} RUB`,
                url: paymentUrl,
              },
            ],
          ],
        },
        parse_mode: 'HTML',
      }
    )

    // Выходим из сцены
    await ctx.scene.leave()
  } catch (error) {
    console.error('Error in creating top-up payment:', error)
    await ctx.answerCbQuery(
      isRu
        ? 'Ошибка при создании платежа. Попробуйте снова.'
        : 'Error creating payment. Please try again.'
    )
  }
})

// Добавляем обработчик для кнопки "Назад"
paymentScene.action('back_to_payment', async ctx => {
  const isRu = isRussian(ctx)

  // Удаляем сообщение с выбором суммы
  await ctx.deleteMessage()

  // Отправляем новое сообщение с выбором способа оплаты
  const message = isRu ? 'Как вы хотите оплатить?' : 'How do you want to pay?'

  const keyboard = Markup.keyboard([
    [
      Markup.button.text(isRu ? '⭐️ Звездами' : '⭐️ Stars'),
      {
        text: isRu ? 'Что такое звезды❓' : 'What are stars❓',
        web_app: {
          url: `https://telegram.org/blog/telegram-stars/${
            isRu ? 'ru' : 'en'
          }?ln=a`,
        },
      },
    ],
    [
      Markup.button.text(isRu ? '💳 Рублями' : '💳 In rubles'),
      Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu'),
    ],
  ]).resize()

  await ctx.reply(message, {
    reply_markup: keyboard.reply_markup,
  })
})

paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  console.log('CASE: 🏠 Главное меню', ctx.match)
  await ctx.scene.enter('menuScene')
})
