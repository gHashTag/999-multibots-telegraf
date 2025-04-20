import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { handleSelectRubAmount } from '@/handlers' // Импортируем нужный хендлер
import { isRussian } from '@/helpers'
import { logger } from '@/utils/logger'

export const rublePaymentScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.RublePaymentScene
)

rublePaymentScene.enter(async ctx => {
  const isRu = isRussian(ctx)
  logger.info(`Entering ${ModeEnum.RublePaymentScene}`, {
    telegram_id: ctx.from?.id,
  })
  try {
    // Вызываем хендлер для отображения кнопок выбора суммы
    await handleSelectRubAmount({ ctx, isRu })
  } catch (error: any) {
    logger.error(`Error entering ${ModeEnum.RublePaymentScene}`, {
      error: error.message,
      stack: error.stack,
      telegram_id: ctx.from?.id,
    })
    await ctx.reply(
      isRu
        ? 'Произошла ошибка. Попробуйте позже.'
        : 'An error occurred. Try again later.'
    )
    await ctx.scene.leave()
  }
})

// TODO: Добавить обработчики для кнопок выбора суммы (action)
// TODO: Добавить обработчик для кнопки "Назад" или "Главное меню"

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
