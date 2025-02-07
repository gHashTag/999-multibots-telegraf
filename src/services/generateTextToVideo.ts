import axios, { isAxiosError } from 'axios'
import { isDev, SECRET_API_KEY } from '@/config'

interface TextToVideoResponse {
  success: boolean
  videoUrl?: string
  message?: string
  prompt_id?: number
}

export async function generateTextToVideo(
  prompt: string,
  videoModel: string,
  telegram_id: number,
  username: string,
  isRu: boolean,
  botName: string
): Promise<TextToVideoResponse> {
  try {
    const url = `${
      isDev ? 'http://localhost:3000' : process.env.ELESTIO_URL
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
    if (!isRu)
      throw new Error(
        isRu
          ? 'generateTextToVideo: Не удалось определить isRu'
          : 'generateTextToVideo: Could not identify isRu'
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
