import axios, { isAxiosError } from 'axios'
import { isDev, SECRET_API_KEY } from '@/config'
import { ImageToVideoResponse, VideoModel } from '@/interfaces'

export async function generateImageToVideo(
  imageUrl: string,
  prompt: string,
  videoModel: VideoModel,
  telegram_id: string,
  username: string,
  isRu: boolean,
  botName: string
): Promise<ImageToVideoResponse> {
  try {
    const url = `${
      isDev ? 'http://localhost:3000' : process.env.ELESTIO_URL
    }/generate/image-to-video`

    if (!imageUrl) throw new Error('Image URL is required')
    if (!prompt) throw new Error('Prompt is required')
    if (!videoModel) throw new Error('Video model is required')
    if (!telegram_id) throw new Error('Telegram ID is required')
    if (!username) throw new Error('Username is required')
    if (!isRu) throw new Error('Language is required')

    const response = await axios.post<ImageToVideoResponse>(
      url,
      {
        imageUrl,
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

    console.log('Image to video generation response:', response.data)
    return response.data
  } catch (error) {
    if (isAxiosError(error)) {
      console.error('API Error:', error.response?.data || error.message)
      throw new Error(
        isRu
          ? 'Произошла ошибка при преобразовании изображения в видео'
          : 'Error occurred while converting image to video'
      )
    }
    console.error('Unexpected error:', error)
    throw error
  }
}
