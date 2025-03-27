import { pulseBot } from '@/core/bot'
import fs from 'fs'

export const pulse = async (
  image: string,
  prompt: string,
  command: string,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot_name?: string
) => {
  try {
    if (process.env.NODE_ENV === 'development') return

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
    console.error('Error sending pulse:', error)
    throw new Error('Error sending pulse')
  }
}
