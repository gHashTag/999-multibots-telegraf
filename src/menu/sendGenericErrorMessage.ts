import { MyContext } from '../interfaces'
import logger from '@/utils/logger'

export async function sendGenericErrorMessage(
  ctx: MyContext,
  isRu: boolean,
  error?: Error
): Promise<void> {
  try {
    // Определение сообщения об ошибке
    let errorMessage = isRu
      ? 'Произошла ошибка. Пожалуйста, попробуйте позже.'
      : 'An error occurred. Please try again later.'

    // Если у нас есть объект ошибки, добавим подробности
    if (error) {
      // Логируем ошибку с использованием нового логгера
      logger.error(
        `Error in conversation with user ID ${ctx.from?.id}: ${error.message}`,
        {
          userId: ctx.from?.id,
          username: ctx.from?.username,
          chatId: ctx.chat?.id,
          errorDetails: error,
        }
      )

      // В режиме разработки (или для админов) можно показать детали ошибки
      if (process.env.NODE_ENV === 'development') {
        errorMessage += isRu
          ? `\n\nДетали ошибки: ${error.message}`
          : `\n\nError details: ${error.message}`
      }
    }

    // Отправляем сообщение пользователю
    await ctx.reply(errorMessage)
  } catch (sendError) {
    // Логирование на случай, если не удалось отправить сообщение об ошибке
    logger.error('Failed to send error message to user', {
      userId: ctx.from?.id,
      username: ctx.from?.username,
      chatId: ctx.chat?.id,
      error: sendError,
    })
  }
}
