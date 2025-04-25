import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'

import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { PaymentType } from '@/interfaces/payments.interface'

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
  const intentType = ctx.session.selectedPayment?.type
  const paymentInfo = ctx.session.selectedPayment

  if (
    (intentType === PaymentType.MONEY_INCOME ||
      intentType === PaymentType.REFUND) &&
    paymentInfo
  ) {
    logger.info(
      `[${ModeEnum.PaymentScene}] Entering Star scene for SUBSCRIPTION: ${paymentInfo.subscription}`,
      {
        telegram_id: ctx.from?.id,
        paymentInfo,
      }
    )
    // Передаем информацию о платеже в стейт сцены
    await ctx.scene.enter(ModeEnum.StarPaymentScene, { paymentInfo })
  } else {
    logger.info(`[${ModeEnum.PaymentScene}] Entering Star scene for TOP-UP`, {
      telegram_id: ctx.from?.id,
    })
    // Если это пополнение или нет информации, просто входим
    // Логика выбора пакета звезд должна быть внутри starPaymentScene.enter
    // Убедимся, что starPaymentScene правильно обрабатывает вход без state
    await ctx.scene.enter(ModeEnum.StarPaymentScene)
  }
})

// Переход в сцену оплаты Рублями
paymentScene.hears(['💳 Рублями', '💳 Rubles'], async ctx => {
  const intentType = ctx.session.selectedPayment?.type
  const paymentInfo = ctx.session.selectedPayment

  logger.info(
    `[${ModeEnum.PaymentScene}] User chose Rubles. Checking session: type=${intentType}, paymentInfo exists=${!!paymentInfo}`,
    {
      telegram_id: ctx.from?.id,
      session_selectedPayment: ctx.session.selectedPayment,
    }
  )

  if (
    (intentType === PaymentType.MONEY_INCOME ||
      intentType === PaymentType.REFUND) &&
    paymentInfo
  ) {
    logger.info(
      `[${ModeEnum.PaymentScene}] Entering Ruble scene for SUBSCRIPTION: ${paymentInfo.subscription}`,
      {
        telegram_id: ctx.from?.id,
        paymentInfo,
      }
    )
    // Передаем информацию о платеже в стейт сцены
    await ctx.scene.enter(ModeEnum.RublePaymentScene, { paymentInfo })
  } else {
    logger.info(`[${ModeEnum.PaymentScene}] Entering Ruble scene for TOP-UP`, {
      telegram_id: ctx.from?.id,
    })
    // Если это пополнение или нет информации, просто входим
    await ctx.scene.enter(ModeEnum.RublePaymentScene)
  }
})

// Обработка непредвиденных сообщений
paymentScene.on('message', async ctx => {
  const isRu = isRussian(ctx)
  logger.warn(`[${ModeEnum.PaymentScene}] Received unexpected message`, {
    telegram_id: ctx.from?.id,
    // @ts-ignore - Пытаемся получить текст, даже если тип не TextMessage
    text: ctx.message?.text,
  })
  // ВАЖНО: НЕ отправляем здесь меню снова, т.к. оно должно быть от предыдущего шага
  // Если глобальный обработчик не сработал, значит текст не совпал
  await ctx.reply(
    isRu
      ? 'Пожалуйста, используйте кнопки для выбора.'
      : 'Please use the buttons to make a selection.'
  )
  // УДАЛЯЕМ повторную отправку клавиатуры
  /*
    {
      // Добавляем ту же клавиатуру, что и в enter
      reply_markup: Markup.keyboard([
        // ... кнопки ...
        [Markup.button.text(isRu ? '🏠 Главное меню' : '🏠 Main menu')],
      ]).resize().reply_markup,
    }
  */
})
