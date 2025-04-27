import { Scenes, Markup } from 'telegraf'
import type { MyContext } from '@/interfaces'
import type { SessionPayment } from '@/interfaces/payments.interface'
import { ModeEnum } from '@/interfaces/modes'
import { handleSelectRubAmount } from '@/handlers'
import { isRussian } from '@/helpers'
import { logger } from '@/utils/logger'
import {
  generateRobokassaUrl,
  getInvoiceId,
} from '@/scenes/getRuBillWizard/helper'
import { setPayments } from '@/core/supabase'
import { PaymentType } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { cancelMenu } from '@/menu/cancelMenu'

// Manually define subscription details here for now
// TODO: Move this to a proper config file or fetch from DB
// Commenting out as enum values are incorrect
// const subscriptionDetails = {
//   [SubscriptionType.STANDARD_MONTH]: { name: 'Стандарт Месяц', stars: 10, durationDays: 30, amount_rub: 100 },
//   [SubscriptionType.STANDARD_YEAR]: { name: 'Стандарт Год', stars: 100, durationDays: 365, amount_rub: 1000 },
//   [SubscriptionType.VIP_MONTH]: { name: 'VIP Месяц', stars: 20, durationDays: 30, amount_rub: 200 },
//   [SubscriptionType.VIP_YEAR]: { name: 'VIP Год', stars: 200, durationDays: 365, amount_rub: 2000 },
// } as const;

export const rublePaymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.RublePaymentScene
)

rublePaymentScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  logger.info(`Entering ${ModeEnum.RublePaymentScene}`, {
    telegram_id: ctx.from?.id,
    session_selectedPayment: ctx.session.selectedPayment,
  })

  try {
    // --- Temporarily commenting out subscription logic ---
    /*
    const { selectedPayment } = ctx.session

    if (
      selectedPayment &&
      selectedPayment.amount &&
      selectedPayment.subscription &&
      selectedPayment.subscription !== 'stars' && // Assuming 'stars' is not a valid SubscriptionType enum
      subscriptionDetails[selectedPayment.subscription] // This check needs valid enum keys
    ) {
      logger.info(`Branch: Subscription Purchase`, {
        telegram_id: ctx.from?.id,
        selectedPaymentData: selectedPayment,
      })

      const amount = selectedPayment.amount
      const subKey = selectedPayment.subscription
      const subDetails = subscriptionDetails[subKey]
      const subName = subDetails ? subDetails.name : 'Подписка' // Get subscription name

      logger.info(
        `Showing subscription payment button for ${subName} (${amount} RUB)`,
        {
          telegram_id: ctx.from?.id,
          subscriptionKey: subKey,
        }
      )

      const message = isRu
        ? `Вы выбрали подписку "${subName}".\nСумма к оплате: ${amount} ₽.\n\nНажмите кнопку ниже, чтобы перейти к оплате.`
        : `You have selected the "${subName}" subscription.\nAmount to pay: ${amount} RUB.\n\nPress the button below to proceed to payment.`

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback(
            isRu ? `Оплатить ${amount} ₽` : `Pay ${amount} RUB`,
            `pay_subscription:${amount}:${subKey}` // Pass amount and subscription key
          ),
        ],
        [
          Markup.button.callback(
            isRu ? '🏠 Главное меню' : '🏠 Main Menu',
            'main_menu'
          ),
        ],
      ])

      await ctx.reply(message, keyboard)
    } else {
      logger.info(`Branch: Balance Top-up (Defaulting)`, {
        telegram_id: ctx.from?.id,
        reason: selectedPayment ? 'Invalid selectedPayment data for subscription' : 'No selectedPayment',
        selectedPaymentData: selectedPayment,
      })
      // Always show balance top-up for now
      await handleSelectRubAmount({ ctx, isRu })
    }
    */
    // --- END Temporarily commenting out subscription logic ---

    // Always show balance top-up options for now
    logger.info(`Branch: Balance Top-up (Defaulting)`, {
      telegram_id: ctx.from?.id,
      reason: 'Subscription logic temporarily disabled',
    })
    await handleSelectRubAmount({ ctx, isRu })
  } catch (error: any) {
    logger.error(`Error inside ${ModeEnum.RublePaymentScene}`, {
      error: error.message,
      stack: error.stack,
      telegram_id: ctx.from?.id,
    })
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при входе в раздел оплаты. Попробуйте позже.'
        : 'An error occurred while entering the payment section. Try again later.'
    )
    await ctx.scene.leave()
  }
})

// --- Temporarily commenting out subscription payment action handler ---
/*
rublePaymentScene.action(/pay_subscription:(\d+):(.+)/, async ctx => {
  const isRu = isRussian(ctx)
  const amount = parseInt(ctx.match[1], 10)
  const subscriptionKey = ctx.match[2] as SubscriptionType // Cast to enum type
  const telegramId = ctx.from?.id

  if (!telegramId) {
    logger.error('Cannot process payment without telegram_id', {
      match: ctx.match,
    })
    await ctx.answerCbQuery(
      isRu
        ? 'Ошибка: Не удалось определить ваш ID.'
        : 'Error: Could not determine your ID.'
    )
    return
  }

  if (isNaN(amount) || amount <= 0) {
    logger.error('Invalid amount for subscription payment', {
      amount,
      match: ctx.match,
    })
    await ctx.answerCbQuery(
      isRu ? 'Ошибка: Неверная сумма.' : 'Error: Invalid amount.'
    )
    return
  }

  // Check if subscriptionKey is a valid enum member
  if (!Object.values(SubscriptionType).includes(subscriptionKey)) {
     logger.error('Invalid subscription key received', { subscriptionKey, match: ctx.match });
     await ctx.answerCbQuery(isRu ? 'Ошибка: Неверный тип подписки.' : 'Error: Invalid subscription type.');
     return;
  }

  // Use the manually defined details (ensure it exists and has correct keys)
  const subDetails = subscriptionDetails[subscriptionKey];
  if (!subDetails) {
    logger.error('Subscription details not found for key', { subscriptionKey });
    await ctx.answerCbQuery(isRu ? 'Ошибка: Детали подписки не найдены.' : 'Error: Subscription details not found.');
    return;
  }

  logger.info(`Processing subscription payment via Robokassa`, {
    telegram_id: telegramId,
    amount,
    subscriptionKey,
  })

  try {
    const invoiceId = getInvoiceId() // Генерируем уникальный ID счета
    const paymentUrl = generateRobokassaUrl(
      amount,
      invoiceId,
      isRu
        ? `Оплата подписки ${subDetails.name}`
        : `Subscription payment ${subDetails.name}`,
      String(telegramId), // Передаем telegramId как string
      { shp_SubscriptionKey: subscriptionKey } // Доп. параметры
    )

    // Сохраняем запись о попытке платежа в БД
    await setPayments({
      telegram_id: String(telegramId), // Use string
      OutSum: String(amount), // Use string
      InvId: String(invoiceId), // Use string
      currency: 'RUB',
      stars: subDetails.stars, // Add stars based on subscription
      status: 'pending', // Изначальный статус
      payment_method: 'Robokassa', // Explicitly set method
      bot_name: ctx.botInfo?.username || 'UnknownBot', // Get bot name
      language: isRu ? 'ru' : 'en', // Add language
      subscription: subscriptionKey, // Save subscription type
      description: isRu ? `Попытка оплаты подписки ${subDetails.name}` : `Subscription payment attempt ${subDetails.name}`,
      // metadata: { subscriptionKey }, // Redundant, already in subscription column
    })

    // const messageText = createPaymentLinkMessage(amount, isRu, 'RUB') // Function not found
    const messageText = isRu
      ? `✅ Счет создан!\nСумма: ${amount} ₽\nНазначение: Подписка ${subDetails.name}\n\nНажмите кнопку ниже, чтобы перейти к оплате.`
      : `✅ Invoice created!\nAmount: ${amount} RUB\nPurpose: Subscription ${subDetails.name}\n\nPress the button below to proceed to payment.`
    const keyboard = Markup.inlineKeyboard([
      Markup.button.url(
        isRu ? '🔗 Перейти к оплате' : '🔗 Proceed to Payment',
        paymentUrl
      ),
      Markup.button.callback(
        isRu ? '🔄 Проверить оплату' : '🔄 Check Payment',
        `check_payment:${invoiceId}`
      ), // TODO: Implement check_payment handler
      Markup.button.callback(
        isRu ? '↩️ Назад' : '↩️ Back',
        'back_to_payment_options'
      ), // Or 'main_menu' if preferred
    ])

    // Отправляем сообщение со ссылкой на оплату
    // Сначала удалим предыдущее сообщение с кнопками выбора (если оно есть и это callback_query)
    if (ctx.callbackQuery?.message) {
      await ctx
        .deleteMessage(ctx.callbackQuery.message.message_id)
        .catch(e =>
          logger.warn('Failed to delete previous message', { error: e })
        )
    }
    await ctx.reply(messageText, keyboard)
    await ctx.answerCbQuery() // Подтверждаем получение колбэка
  } catch (error: any) {
    logger.error('Error processing Robokassa subscription payment', {
      error: error.message,
      stack: error.stack,
      telegram_id: telegramId,
      amount,
      subscriptionKey,
    })
    await ctx.answerCbQuery(
      isRu ? 'Произошла ошибка при создании счета.' : 'Error creating invoice.'
    )
    await ctx.reply(
      isRu
        ? 'Не удалось создать ссылку на оплату. Попробуйте позже.'
        : 'Failed to create payment link. Try again later.'
    )
  }
})
*/
// --- END Temporarily commenting out subscription payment action handler ---

// Обработчик для кнопки "Главное меню"
rublePaymentScene.action('main_menu', async ctx => {
  const isRu = isRussian(ctx)
  logger.info(`User requested main menu from ${ModeEnum.RublePaymentScene}`, {
    telegram_id: ctx.from?.id,
  })
  await ctx.answerCbQuery()
  await ctx.scene.leave()
  // Здесь можно отправить главное меню, если оно не отправляется автоматически после выхода из сцены
  // await ctx.telegram.sendMessage(ctx.chat.id, 'Главное меню', MainMenuKeyboard(isRu));
})

// Обработчик для кнопки "Назад" (если используется)
rublePaymentScene.action('back_to_payment_options', async ctx => {
  const isRu = isRussian(ctx)
  await ctx.answerCbQuery()
  // Удаляем сообщение со ссылкой на оплату
  if (ctx.callbackQuery?.message) {
    await ctx
      .deleteMessage(ctx.callbackQuery.message.message_id)
      .catch(e =>
        logger.warn('Failed to delete payment link message', { error: e })
      )
  }
  // Просто перезаходим в сцену, чтобы показать начальные опции (подписка или пополнение)
  await ctx.scene.reenter()
})

// TODO: Добавить обработчики для кнопок выбора суммы (action) из handleSelectRubAmount
// TODO: Добавить обработчик для кнопки "Назад" или "Главное меню" из handleSelectRubAmount

rublePaymentScene.on('message', async ctx => {
  const isRu = isRussian(ctx)
  logger.warn(`[${ModeEnum.RublePaymentScene}] Received unexpected message`, {
    telegram_id: ctx.from?.id,
    // @ts-ignore
    message_text: ctx.message?.text,
  })
  await ctx.reply(
    isRu
      ? 'Пожалуйста, выберите сумму для пополнения или вернитесь назад.'
      : 'Please select an amount to top up or go back.'
  )
})
