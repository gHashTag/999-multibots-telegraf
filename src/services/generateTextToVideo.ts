import axios, { isAxiosError } from 'axios'
import { isDev, SECRET_API_KEY, ELESTIO_URL, LOCAL_SERVER_URL } from '@/config'

// Используем заглушку, если переменная не установлена
const API_URL = process.env.ELESTIO_URL || 'https://example.com'

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
    // В случае отсутствия реального URL возвращаем сообщение о недоступности
    if (API_URL === 'https://example.com') {
      console.log('⚠️ ELESTIO_URL not set, skipping text-to-video API call')
      return {
        success: false,
        message: is_ru
          ? 'Функция генерации видео временно недоступна.'
          : 'Video generation function is temporarily unavailable.',
      }
    }

    const url = `${isDev ? LOCAL_SERVER_URL : API_URL}/generate/text-to-video`

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
