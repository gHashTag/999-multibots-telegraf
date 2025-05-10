import { MyContext } from '../interfaces'
import { logger } from '@/utils/logger'
import { inngest } from '../inngest_app/client'

/**
 * Обработчик команды /hello_world
 * Отправляет тестовое событие в Inngest для проверки интеграции
 */
export const handleHelloWorld = async (ctx: MyContext) => {
  logger.info('COMMAND /hello_world: Testing Inngest integration', {
    telegramId: ctx.from?.id,
  })

  try {
    const waitingMessage = await ctx.reply(
      '🔄 Отправка тестового события в Inngest...'
    )

    // Отправляем тестовое событие в Inngest
    await inngest.send({
      name: 'test/hello.world',
      data: {
        test: true,
        message: 'Test event from Telegram bot',
        timestamp: new Date().toISOString(),
        telegramUser: {
          id: ctx.from?.id,
          username: ctx.from?.username,
          firstName: ctx.from?.first_name,
          lastName: ctx.from?.last_name,
        },
      },
    })

    // Обновляем сообщение с результатом
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      waitingMessage.message_id,
      undefined,
      `✅ Тестовое событие успешно отправлено в Inngest!\n\nСобытие должно быть обработано Inngest-функцией в течение нескольких секунд.`
    )

    logger.info('COMMAND /hello_world: Inngest test event sent successfully', {
      telegramId: ctx.from?.id,
    })
  } catch (error) {
    logger.error('Error in /hello_world command:', {
      error: error instanceof Error ? error.message : String(error),
      telegramId: ctx.from?.id,
    })

    await ctx.reply(
      '❌ Ошибка при отправке тестового события в Inngest. Подробности в логах.'
    )
  }
}
