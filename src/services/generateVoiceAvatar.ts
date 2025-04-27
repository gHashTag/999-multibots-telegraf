import axios from 'axios'
import { SECRET_API_KEY, API_URL } from '@/config'
import { MyContext } from '@/interfaces'
import { sendGenericErrorMessage } from '@/menu'

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
    const url = `${API_URL}/generate/voice-avatar`

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
