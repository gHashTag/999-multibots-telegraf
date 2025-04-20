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
  logger.info('### paymentScene ROUTER ENTERED ###', {
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
  logger.info(
    `[${ModeEnum.PaymentScene}] User chose Stars. Entering ${ModeEnum.StarPaymentScene}`,
    {
      telegram_id: ctx.from?.id,
    }
  )
  // Просто переходим в новую сцену, передавая управление ей
  // ctx.session.subscription остается как есть (если был установлен ранее)
  await ctx.scene.enter(ModeEnum.StarPaymentScene)
})

// Переход в сцену оплаты Рублями
paymentScene.hears(['💳 Рублями', '💳 Rubles'], async ctx => {
  logger.info(
    `[${ModeEnum.PaymentScene}] User chose Rubles. Entering ${ModeEnum.RublePaymentScene}`,
    {
      telegram_id: ctx.from?.id,
    }
  )
  // Просто переходим в новую сцену
  // ctx.session.subscription остается как есть
  await ctx.scene.enter(ModeEnum.RublePaymentScene)
})

// Выход в главное меню
paymentScene.hears(['🏠 Главное меню', '🏠 Main menu'], async ctx => {
  logger.info(`[${ModeEnum.PaymentScene}] Leaving scene via Main Menu button`, {
    telegram_id: ctx.from?.id,
  })
  await ctx.scene.enter(ModeEnum.MenuScene)
})

// Убираем обработчики action (top_up_*, buy_sub_*), т.к. они теперь в дочерних сценах

// Обработка любых других сообщений
paymentScene.on('message', async ctx => {
  const isRu = isRussian(ctx)
  logger.warn(`[${ModeEnum.PaymentScene}] Received unexpected message`, {
    telegram_id: ctx.from?.id,
    // @ts-ignore
    message_text: ctx.message?.text,
  })
  await ctx.reply(
    isRu
      ? 'Пожалуйста, выберите способ оплаты (⭐️ или 💳) или вернитесь в главное меню.'
      : 'Please select a payment method (⭐️ or 💳) or return to the main menu.'
  )
  // Остаемся в этой сцене-роутере
})
