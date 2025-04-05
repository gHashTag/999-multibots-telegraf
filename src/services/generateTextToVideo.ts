import axios, { isAxiosError } from 'axios'
import { isDev, SECRET_API_KEY, ELESTIO_URL, LOCAL_SERVER_URL } from '@/config'

interface TextToVideoResponse {
  success: boolean
  videoUrl?: string
  message?: string
  prompt_id?: number
}

export async function generateTextToVideo(
  prompt: string,
  videoModel: string,
  telegram_id: TelegramId,
  username: string,
  isRu: boolean,
  botName: string
): Promise<TextToVideoResponse> {
  try {
    const url = `${
      isDev ? LOCAL_SERVER_URL : ELESTIO_URL
    }/generate/text-to-video`

    if (!prompt)
      throw new Error(
        isRu
          ? 'generateTextToVideo: Не удалось определить промпт'
          : 'generateTextToVideo: Could not identify prompt'
      )
    if (!videoModel)
      throw new Error(
        isRu
          ? 'generateTextToVideo: Не удалось определить модель'
          : 'generateTextToVideo: Could not identify model'
      )
    if (!telegram_id)
      throw new Error(
        isRu
          ? 'generateTextToVideo: Не удалось определить telegram_id'
          : 'generateTextToVideo: Could not identify telegram_id'
      )
    if (!username)
      throw new Error(
        isRu
          ? 'generateTextToVideo: Не удалось определить username'
          : 'generateTextToVideo: Could not identify username'
      )

    const response = await axios.post<TextToVideoResponse>(
      url,
      {
        prompt,
        videoModel,
        telegram_id,
        username,
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

    console.log('Text to video generation response:', response.data)

    return response.data
  } catch (error) {
    if (isAxiosError(error)) {
      console.error('API Error:', error.response?.data || error.message)
      throw new Error(
        isRu
          ? 'generateTextToVideo: Произошла ошибка при генерации видео'
          : 'generateTextToVideo: Error occurred while generating video'
      )
    }
    console.error('Unexpected error:', error)
    throw error
  }
}
