import { pulseBot } from '@/core/bot'

export const pulseNeuroImageV2 = async (
  image: string,
  prompt: string,
  command: string,
  telegram_id: string,
  username: string,
  is_ru: boolean
) => {
  try {
    // if (process.env.NODE_ENV === 'development') return

    if (!image) {
      throw new Error('Invalid data received in pulseNeuroImageV2')
    }

    if (!prompt) {
      throw new Error('Invalid prompt received in pulseNeuroImageV2')
    }

    const truncatedPrompt = prompt.length > 800 ? prompt.slice(0, 800) : prompt
    const caption = is_ru
      ? `@${
          username || 'Пользователь без username'
        } Telegram ID: ${telegram_id} сгенерировал изображение с промптом: ${truncatedPrompt} \n\n Команда: ${command}`
      : `@${
          username || 'User without username'
        } Telegram ID: ${telegram_id} generated an image with a prompt: ${truncatedPrompt} \n\n Command: ${command}`

    const chatId = '@neuro_blogger_pulse'

    await pulseBot.telegram.sendPhoto(chatId, image, { caption })
  } catch (error) {
    console.error('Error sending pulse:', error)
    throw new Error('Error sending pulse')
  }
}
