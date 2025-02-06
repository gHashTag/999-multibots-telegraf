import { MyContext } from '../interfaces'
import bot from '../core/bot'

export const pulse = async (
  ctx: MyContext,
  image: string | null,
  prompt: string,
  command: string
) => {
  const truncatedPrompt = prompt.length > 800 ? prompt.slice(0, 800) : prompt
  const caption = `@${
    ctx.from?.username || 'Пользователь без username'
  } Telegram ID: ${
    ctx.from?.id
  } сгенерировал изображение с промптом: ${truncatedPrompt} \n\n Команда: ${command}`

  try {
    if (process.env.NODE_ENV === 'development') return

    const chatId = '-4166575919' // Изначальный идентификатор чата

    if (image) {
      // Если изображение начинается с data:image/, нужно получить только base64
      let imageToSend = image
      if (image.startsWith('data:image/')) {
        imageToSend = image.split(',')[1]
      }

      // Преобразуем base64 в буфер
      const imageBuffer = Buffer.from(imageToSend, 'base64')

      // Отправляем как InputFile
      await bot.telegram.sendPhoto(
        chatId,
        { source: imageBuffer },
        { caption } // Используем переменную caption, которая определена выше
      )
    } else {
      // Отправляем текст, если изображения нет
      const textMessage = `@${
        ctx.from?.username || 'Пользователь без username'
      } Telegram ID: ${
        ctx.from?.id
      } использовал команду: ${command} с промптом: ${truncatedPrompt}`
      await bot.telegram.sendMessage(chatId, textMessage)
    }
  } catch (error) {
    if (
      error.response &&
      error.response.parameters &&
      error.response.parameters.migrate_to_chat_id
    ) {
      // Обновляем chatId на новый идентификатор супергруппы
      const newChatId = error.response.parameters.migrate_to_chat_id
      try {
        if (image) {
          // Повторяем попытку отправки изображения с новым chatId
          let imageToSend = image
          if (image.startsWith('data:image/')) {
            imageToSend = image.split(',')[1]
          }
          const imageBuffer = Buffer.from(imageToSend, 'base64')
          await bot.telegram.sendPhoto(
            newChatId,
            { source: imageBuffer },
            { caption } // Используем переменную caption, которая определена выше
          )
        } else {
          // Повторяем попытку отправки текста с новым chatId
          const textMessage = `@${
            ctx.from?.username || 'Пользователь без username'
          } Telegram ID: ${
            ctx.from?.id
          } использовал команду: ${command} с промптом: ${truncatedPrompt}`
          await bot.telegram.sendMessage(newChatId, textMessage)
        }
      } catch (retryError) {
        console.error('Error retrying pulse send:', retryError)
        throw new Error('Ошибка при повторной отправке пульса')
      }
    } else {
      console.error('Error sending pulse:', error)
      throw new Error('Ошибка при отправке пульса')
    }
  }
}
