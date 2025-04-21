import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import {
  handleSelectStars,
  handleBuySubscription,
  handleSelectRubAmount,
} from '@/handlers'
import { starAmounts } from '@/price/helpers/starAmounts'
import { getInvoiceId } from '@/scenes/getRuBillWizard/helper'
import { MERCHANT_LOGIN, PASSWORD1 } from '@/config'
import { setPayments } from '@/core/supabase'
import { getBotNameByToken } from '@/core'
import { rubTopUpOptions } from '@/price/helpers/rubTopUpOptions'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Старая сцена оплаты, теперь используется как точка входа
 * для выбора типа оплаты (Звезды или Рубли).
 */
export const paymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.PaymentScene
)

paymentScene.enter(async ctx => {
  console.log(`[PaymentScene LOG] === ENTER Scene === (User: ${ctx.from?.id})`)
  logger.info('### paymentScene ENTERED ###', {
    scene: ModeEnum.PaymentScene,
    step: 'enter',
    telegram_id: ctx.from?.id,
    session_subscription: ctx.session.subscription, // Логируем, что пришло в сессии
  })
  const isRu = isRussian(ctx)
  try {
    const message = isRu ? 'Выберите способ оплаты:' : 'Select payment method:'

    // Оставляем только кнопки выбора типа оплаты и справку по звездам
    const keyboard = Markup.keyboard([
      [
        Markup.button.text(isRu ? '⭐️ Звездами' : '⭐️ Stars'),
        Markup.button.text(isRu ? '💳 Рублями' : '💳 Rubles'), // Изменил эмодзи для единообразия
      ],
      [
        {
          text: isRu ? 'Что такое звезды❓' : 'What are stars❓',
          web_app: {
            url: `https://telegram.org/blog/telegram-stars/${
              isRu ? 'ru' : 'en'
            }?ln=a`,
          },
        },
      ],
      [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu')], // Добавляем кнопку выхода
    ]).resize()

    await ctx.reply(message, {
      reply_markup: keyboard.reply_markup,
      // Убираем старую клавиатуру, если она была
      // reply_markup: { remove_keyboard: true },
    })
  } catch (error: any) {
    logger.error(`❌ [${ModeEnum.PaymentScene}] Error in enter:`, {
      error: error.message,
      stack: error.stack,
      telegram_id: ctx.from?.id,
    })
    await ctx.reply(
      isRu
        ? 'Произошла ошибка. Пожалуйста, попробуйте войти снова через меню.'
        : 'An error occurred. Please try entering again via the menu.'
    )
    // Выходим из сцены в случае ошибки входа
    await ctx.scene.leave()
  }
})

// Переход в сцену оплаты Звездами
paymentScene.hears(['⭐️ Звездами', '⭐️ Stars'], async ctx => {
  console.log(
    `[PaymentScene LOG] --- HEARS '⭐️ Звездами' --- (User: ${ctx.from?.id})`
  )
  console.log('[PaymentScene] Hears: ⭐️ Звездами triggered')
  const isRu = isRussian(ctx)
  const subscription = ctx.session.subscription?.toLowerCase()
  console.log(
    '[PaymentScene] Hears: ⭐️ Звездами. Session subscription:',
    subscription
  )
  try {
    if (subscription) {
      if (
        [
          'neurobase',
          'neuromeeting',
          'neuroblogger',
          'neurophoto',
          'neuromentor',
        ].includes(subscription)
      ) {
        console.log(
          `[PaymentScene LOG] Calling handleBuySubscription for known subscription: ${subscription}`
        )
        await handleBuySubscription({ ctx, isRu })
        return
      } else if (subscription === 'stars') {
        console.log(
          `[PaymentScene LOG] Calling handleSelectStars for 'stars' subscription.`
        )
        await handleSelectStars({ ctx, isRu, starAmounts })
        return
      }
    } else {
      console.log(
        `[PaymentScene LOG] Calling handleSelectStars (no subscription in session).`
      )
      await handleSelectStars({ ctx, isRu, starAmounts })
      return
    }
    logger.warn(
      `[${ModeEnum.PaymentScene}] Unknown or unhandled subscription type in 'Stars' handler: ${subscription}`,
      {
        telegram_id: ctx.from?.id,
      }
    )
    await ctx.reply(
      isRu
        ? 'Произошла непредвиденная ошибка.'
        : 'An unexpected error occurred.'
    )
  } catch (error) {
    logger.error(
      `❌ [${ModeEnum.PaymentScene}] Error in Hears '⭐️ Звездами':`,
      {
        error: error instanceof Error ? error.message : String(error),
        telegram_id: ctx.from?.id,
      }
    )
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при обработке звезд.'
        : 'An error occurred while processing stars.'
    )
  }
})

// Переход в сцену оплаты Рублями
paymentScene.hears(['💳 Рублями', '💳 Rubles'], async ctx => {
  // Добавляем детальное логирование сессии ПЕРЕД переходом
  logger.info(
    `[${ModeEnum.PaymentScene}] User chose Rubles. Checking session before entering ${ModeEnum.RublePaymentScene}`,
    {
      telegram_id: ctx.from?.id,
      session_subscription: ctx.session.subscription, // Что было выбрано
      session_selectedPayment: ctx.session.selectedPayment, // Ключевые данные для rublePaymentScene
    }
  )
  // Просто переходим в сцену рублей. Логика внутри rublePaymentScene.enter должна разобраться.
  await ctx.scene.enter(ModeEnum.RublePaymentScene)
})

// Выход в главное меню
paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  logger.info(`[${ModeEnum.PaymentScene}] Leaving scene via Main Menu button`, {
    telegram_id: ctx.from?.id,
  })
  await ctx.scene.enter(ModeEnum.MainMenu)
})

// Обработка непредвиденных сообщений
paymentScene.on('message', async ctx => {
  const isRu = isRussian(ctx)
  logger.warn(`[${ModeEnum.PaymentScene}] Received unexpected message`, {
    telegram_id: ctx.from?.id,
    // @ts-ignore - Пытаемся получить текст, даже если тип не TextMessage
    text: ctx.message?.text,
  })
  await ctx.reply(
    isRu
      ? 'Пожалуйста, выберите способ оплаты (⭐️ или 💳) или вернитесь в главное меню.'
      : 'Please select a payment method (⭐️ or 💳) or return to the main menu.',
    {
      // Добавляем ту же клавиатуру, что и в enter
      reply_markup: Markup.keyboard([
        [
          Markup.button.text(isRu ? '⭐️ Звездами' : '⭐️ Stars'),
          Markup.button.text(isRu ? '💳 Рублями' : '💳 Rubles'),
        ],
        [
          {
            text: isRu ? 'Что такое звезды❓' : 'What are stars❓',
            web_app: {
              url: `https://telegram.org/blog/telegram-stars/${
                isRu ? 'ru' : 'en'
              }?ln=a`,
            },
          },
        ],
        [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu')],
      ]).resize().reply_markup,
    }
  )
})
