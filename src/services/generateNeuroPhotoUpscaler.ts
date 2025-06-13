import axios, { isAxiosError } from 'axios'
import {
  isDev,
  SECRET_API_KEY,
  API_SERVER_URL,
  LOCAL_SERVER_URL,
} from '@/config'
import { logger } from '@/utils/logger'
import { MyContext } from '@/interfaces'

export interface NeuroPhotoUpscaleRequest {
  imageUrl: string
  telegram_id: string
  username: string
  is_ru: boolean
  originalPrompt?: string
  bot_name: string
}

export interface NeuroPhotoUpscaleResponse {
  success: boolean
  data?: {
    upscaledImageUrl: string
    cost: number
  }
  error?: string
}

export async function generateNeuroPhotoUpscaler(
  params: NeuroPhotoUpscaleRequest
): Promise<NeuroPhotoUpscaleResponse> {
  const { imageUrl, telegram_id, username, is_ru, originalPrompt, bot_name } =
    params

  logger.info('Starting neurophoto upscaling via backend API', {
    telegram_id,
    originalPrompt,
    service: 'backend_neurophoto_upscaler',
  })

  try {
    const url = `${
      isDev ? LOCAL_SERVER_URL : API_SERVER_URL
    }/generate/upscale-neurophoto`

    const response = await axios.post<NeuroPhotoUpscaleResponse>(
      url,
      {
        imageUrl,
        telegram_id,
        username,
        is_ru,
        originalPrompt: originalPrompt || 'Neurophoto upscale',
        bot_name,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_API_KEY,
        },
        timeout: 300000, // 5 минут таймаут для upscaling
      }
    )

    logger.info('Neurophoto upscaling API response received', {
      telegram_id,
      success: response.data.success,
      service: 'backend_neurophoto_upscaler',
    })

    return response.data
  } catch (error) {
    if (isAxiosError(error)) {
      logger.error('API Error in neurophoto upscaling:', {
        telegram_id,
        error: error.response?.data || error.message,
        service: 'backend_neurophoto_upscaler',
      })

      return {
        success: false,
        error: error.response?.data?.error || 'Backend API error',
      }
    }

    logger.error('Unexpected error in neurophoto upscaling:', {
      telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      service: 'backend_neurophoto_upscaler',
    })

    return {
      success: false,
      error: 'Unexpected error occurred',
    }
  }
}
