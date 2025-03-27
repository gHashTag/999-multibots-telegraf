import { pulseBot } from '@/core/bot'
import fs from 'fs'
import { logger } from '@/utils/logger'

// Для обратной совместимости поддерживаем старый формат
export const pulse = async (
  imageOrOptions: string | PulseOptions,
  prompt?: string,
  command?: string,
  telegram_id?: string,
  username?: string,
  is_ru?: boolean,
  bot_name?: string
) => {
  try {
    if (process.env.NODE_ENV === 'development') return

    // Проверяем новый формат (объект)
    if (typeof imageOrOptions === 'object') {
      const options = imageOrOptions as PulseOptions

      logger.info({
        message: '📡 Отправка данных в pulse (новый формат)',
        description: 'Sending data to pulse (new format)',
        action: options.action,
      })

      // Для каждого типа действия используем специфичную логику
      if (options.action === 'NeurophotoV2') {
        const { imageUrl, prompt, service, user } = options.result
        const { telegramId, username, language } = user
        const isRussian = language === 'ru'

        const truncatedPrompt =
          prompt.length > 800 ? prompt.slice(0, 800) : prompt
        const caption = isRussian
          ? `@${
              username || 'Пользователь без username'
            } Telegram ID: ${telegramId} сгенерировал изображение с промптом: ${truncatedPrompt} \n\n Сервис: ${service}`
          : `@${
              username || 'User without username'
            } Telegram ID: ${telegramId} generated an image with a prompt: ${truncatedPrompt} \n\n Service: ${service}`

        const chatId = '@neuro_blogger_pulse'

        // Отправляем по URL вместо локального файла
        await pulseBot.telegram.sendPhoto(
          chatId,
          { url: imageUrl },
          { caption }
        )

        return
      }

      // Для других типов можно добавить дополнительную логику
      logger.warn({
        message: '⚠️ Неизвестный тип действия в pulse',
        description: 'Unknown action type in pulse',
        action: options.action,
      })

      return
    }

    // Старый формат (параметры по отдельности)
    logger.info({
      message: '📡 Отправка данных в pulse (старый формат)',
      description: 'Sending data to pulse (old format)',
      telegram_id,
      command,
    })

    const image = imageOrOptions // В старом формате первый параметр - это путь к изображению
    const truncatedPrompt = prompt.length > 800 ? prompt.slice(0, 800) : prompt
    const caption = is_ru
      ? `@${
          username || 'Пользователь без username'
        } Telegram ID: ${telegram_id} сгенерировал изображение с промптом: ${truncatedPrompt} \n\n Команда: ${command} \n\n Bot: @${bot_name}`
      : `@${
          username || 'User without username'
        } Telegram ID: ${telegram_id} generated an image with a prompt: ${truncatedPrompt} \n\n Command: ${command} \n\n Bot: @${bot_name}`

    const chatId = '@neuro_blogger_pulse'

    // send image as buffer
    await pulseBot.telegram.sendPhoto(
      chatId,
      { source: fs.createReadStream(image) },
      { caption }
    )
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке в pulse',
      description: 'Error sending to pulse',
      error: error.message,
      stack: error.stack,
    })
  }
}

// Интерфейсы для нового формата
interface PulseOptions {
  action: string
  result: any
}
