import axios, { isAxiosError } from 'axios'
import { isDev, SECRET_API_KEY } from '@/config'
import { MyContext } from '@/interfaces'
import { sendGenericErrorMessage } from '@/menu'

interface VoiceAvatarResponse {
  success: boolean
  message: string
}

export async function generateVoiceAvatar(
  fileUrl: string,
  telegram_id: number,
  ctx: MyContext,
  isRu: boolean
): Promise<VoiceAvatarResponse> {
  try {
    const url = `${
      isDev ? 'http://localhost:3000' : process.env.ELESTIO_URL
    }/generate/create-avatar-voice`

    const response = await axios.post<VoiceAvatarResponse>(
      url,
      {
        fileUrl,
        telegram_id,
        username: ctx.from?.username,
        is_ru: isRu,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_API_KEY,
        },
      }
    )

    console.log('Voice avatar creation response:', response.data)
    return response.data
  } catch (error) {
    if (isAxiosError(error)) {
      console.error('API Error:', error.response?.data || error.message)
      await sendGenericErrorMessage(ctx, isRu, error)
    }
    console.error('Unexpected error:', error)
    throw error
  }
}
