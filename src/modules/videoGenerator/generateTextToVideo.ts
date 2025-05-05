import axios, { isAxiosError } from 'axios'
import { API_URL, SECRET_API_KEY } from '@/config'

interface TextToVideoResponse {
  success: boolean
  videoUrl?: string
  message?: string
  prompt_id?: number
}

export async function generateTextToVideo(
  prompt: string,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot_name: string
): Promise<TextToVideoResponse> {
  try {
    const url = `${API_URL}/generate/text-to-video`

    const response = await axios.post<TextToVideoResponse>(
      url,
      {
        prompt,
        telegram_id,
        username,
        is_ru,
        bot_name,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_API_KEY,
        },
      }
    )

    if (!response.data || !response.data.success) {
      return {
        success: false,
        message: is_ru
          ? 'Сервер не смог сгенерировать видео.'
          : 'Server was unable to generate the video.',
      }
    }

    return response.data
  } catch (error) {
    console.error('Error generating text to video:', error)

    let errorMessage = is_ru
      ? 'Произошла ошибка при создании видео.'
      : 'An error occurred while creating the video.'

    if (isAxiosError(error) && error.response?.data?.message) {
      errorMessage = error.response.data.message
    }

    return {
      success: false,
      message: errorMessage,
    }
  }
}
