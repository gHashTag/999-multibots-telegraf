/**
 * Render Server Client
 * Клиент для взаимодействия с render-server на Railway
 *
 * Server: https://render-v3-production.up.railway.app
 * Inngest: https://render-v3-production.up.railway.app/api/inngest
 * Functions: render, render-avatar-video, render-riddle
 *
 * Использует inngestProvider для управления RENDER инстансом
 */

import { logger } from '@/utils/logger'
import { inngestProvider } from './inngest-provider'

logger.info('📦 [RENDER CLIENT] Module loaded, inngestProvider imported')

const RENDER_SERVER_URL = 'https://render-v3-production.up.railway.app'

export interface RenderRiddlePayload {
  job_id: string
  eleven_labs_api_key: string
  kie_api_key: string
  cover_url: string
  intro_text_1: {
    text: string
    position: [number, number]
    font_size: number
  }
  intro_text_2: {
    text: string
    position: [number, number]
    font_size: number
  }
  upper_intro_text?: string
  circle_position: [number, number, number]
  circle_scale: [number, number, number]
  avatar_gen_service: 'hedra' | 'heygen'
  avatar_settings: {
    api_key: string
    avatar_photo_url: string
    avatar_id: string
    voice_id: string
    avatar_speech: string
  }
  callback_url?: string
}

/**
 * Отправляет событие render-riddle на render-server
 * Использует RENDER инстанс через inngestProvider
 */
export async function sendRenderAvatarVideoEvent(
  payload: RenderRiddlePayload
): Promise<{ eventId: string }> {
  logger.info('🎬 [RENDER SERVER] Sending avatar video event', {
    jobId: payload.job_id,
    service: payload.avatar_gen_service,
  })

  try {
    const result = await inngestProvider.sendEvent(
      'RENDER',
      'render-riddle',
      payload
    )

    if (!result) {
      throw new Error('Failed to send event to RENDER instance')
    }

    logger.info('✅ [RENDER SERVER] Event sent successfully', {
      jobId: payload.job_id,
      eventId: result.eventId,
    })

    return result
  } catch (error) {
    logger.error('❌ [RENDER SERVER] Error sending event', {
      error: error instanceof Error ? error.message : String(error),
      jobId: payload.job_id,
    })
    throw error
  }
}

/**
 * Проверяет доступность render-server
 * Использует RENDER инстанс через inngestProvider
 */
export async function checkRenderServerAvailability(): Promise<boolean> {
  return await inngestProvider.checkAvailability('RENDER')
}

/**
 * Создает payload для render-riddle из параметров бота
 */
export function createRenderAvatarPayload(
  telegramId: string,
  text: string,
  avatarPhotoUrl: string,
  voiceId: string,
  options?: {
    coverUrl?: string
    introText1?: string
    introText2?: string
    upperIntroText?: string
    callbackUrl?: string
  }
): RenderRiddlePayload {
  return {
    job_id: `telegram-${telegramId}-${Date.now()}`,
    eleven_labs_api_key: process.env.ELEVENLABS_API_KEY || '',
    kie_api_key: process.env.KIE_AI_API_KEY || '',
    cover_url: options?.coverUrl || '',
    intro_text_1: {
      text: options?.introText1 || '',
      position: [540, 1200],
      font_size: 100,
    },
    intro_text_2: {
      text: options?.introText2 || '',
      position: [540, 1340],
      font_size: 100,
    },
    upper_intro_text: options?.upperIntroText || '',
    circle_position: [872, 1360, 0],
    circle_scale: [150, 150, 100],
    avatar_gen_service: 'hedra',
    avatar_settings: {
      api_key: process.env.HEDRA_API_KEY || '',
      avatar_photo_url: avatarPhotoUrl,
      avatar_id: `avatar-${telegramId}-${Date.now()}`,
      voice_id: voiceId,
      avatar_speech: text,
    },
    callback_url:
      options?.callbackUrl ||
      'https://three-head-dragon.shop/api/telegram/ai-reels-callback',
  }
}
