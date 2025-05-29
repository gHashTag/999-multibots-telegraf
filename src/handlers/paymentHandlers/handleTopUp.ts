import { handleBuy } from '@/handlers'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

export async function handleTopUp(ctx: MyContext) {
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  try {
    logger.info(
      '🌟 [handleTopUp] Начало обработки колбэка пополнения звездами',
      {
        telegramId,
        callbackData: (ctx.callbackQuery as any)?.data,
        currentScene: ctx.scene?.current?.id,
        sessionMode: ctx.session?.mode,
      }
    )

    const data = ctx.match?.[0]
    logger.info('🌟 [handleTopUp] Полученные данные колбэка', {
      telegramId,
      data,
      match: ctx.match,
    })

    const isRu = ctx.from?.language_code === 'ru'
    logger.info('🌟 [handleTopUp] Вызываем handleBuy', {
      telegramId,
      data,
      isRu,
    })

    await handleBuy(ctx)

    logger.info(
      '🌟 [handleTopUp] handleBuy завершен успешно, выходим из сцены',
      {
        telegramId,
      }
    )

    await ctx.scene.leave()

    logger.info('✅ [handleTopUp] Успешно завершено', {
      telegramId,
    })
  } catch (error) {
    logger.error('❌ [handleTopUp] Ошибка обработки', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Отправляем пользователю сообщение об ошибке
    const isRu = ctx.from?.language_code === 'ru'
    await ctx.reply(
      isRu
        ? 'Произошла ошибка при обработке платежа. Пожалуйста, попробуйте позже.'
        : 'An error occurred while processing the payment. Please try again later.'
    )
  }
}
