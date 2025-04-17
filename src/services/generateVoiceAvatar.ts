import axios from 'axios'
import { isDev, SECRET_API_KEY, LOCAL_SERVER_URL } from '@/config'
import { MyContext } from '@/interfaces'
import { sendGenericErrorMessage } from '@/menu'

// Используем заглушку, если переменная не установлена
const API_URL = process.env.ELESTIO_URL || 'https://example.com'

interface VoiceAvatarResponse {
  success: boolean
  message: string
}

export async function generateVoiceAvatar(
  imageUrl: string,
  prompt: string,
  telegram_id: string,
  ctx: MyContext,
  isRu: boolean,
  botName: string
): Promise<VoiceAvatarResponse | null> {
  try {
    // В случае отсутствия реального URL возвращаем сообщение о недоступности
    if (API_URL === 'https://example.com') {
      console.log('⚠️ ELESTIO_URL not set, skipping voice-avatar API call')
      try {
        await ctx.reply(
          isRu
            ? 'Функция создания голосового аватара временно недоступна.'
            : 'Voice avatar creation function is temporarily unavailable.'
        )
      } catch (err) {
        console.error('Ошибка при отправке сообщения о недоступности:', err)
      }
      return {
        success: false,
        message: isRu
          ? 'Функция временно недоступна'
          : 'Function temporarily unavailable',
      }
    }

    const url = `${isDev ? LOCAL_SERVER_URL : API_URL}/generate/voice-avatar`

    const response = await axios.post<VoiceAvatarResponse>(
      url,
      {
        imageUrl,
        prompt,
        telegram_id,
        username: ctx.from?.username || '',
        is_ru: isRu,
        bot_name: botName,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_API_KEY,
        },
      }
    )

    return response.data
  } catch (error) {
    console.error('Error generating voice avatar:', error)

    try {
      const errorMessage = isRu
        ? 'Произошла ошибка при создании голосового аватара'
        : 'An error occurred while creating voice avatar'

      await sendGenericErrorMessage(
        ctx,
        isRu,
        error instanceof Error ? error : new Error(errorMessage)
      )
    } catch (err) {
      console.error('Ошибка при отправке сообщения об ошибке:', err)
    }

    return null
  }
}
