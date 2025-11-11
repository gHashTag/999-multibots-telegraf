/**
 * Render Server Client
 * Клиент для взаимодействия с render-server на Render Server
 *
 * Server: https://render-v3-production.up.railway.app
 * Inngest: https://render-v3-production.up.railway.app/api/inngest
 * Functions: render, render-avatar-video, render-riddle
 *
 * Использует inngestProvider для управления RENDER инстансом
 */

import { logger } from '@/utils/logger'
import { PRIMARY_FALLBACK_VOICE_ID, DEFAULT_VOICE_IDS } from '@/config'
import { inngestProvider } from './inngest-provider'
import { createHmac } from 'crypto'

logger.info('📦 [RENDER CLIENT] Module loaded, inngestProvider imported')

const RENDER_SERVER_URL = 'https://render-v3-production.up.railway.app'

/**
 * Создает подпись для Inngest запроса
 */
function createInngestSignature(
  body: string,
  signingKey: string,
  timestamp: number
): string {
  const data = `${timestamp}.${body}`
  const hmac = createHmac('sha256', signingKey)
  hmac.update(data)
  return hmac.digest('hex')
}

/**
 * Render Server API Payload (Updated 2025-10-27)
 * Структура соответствует новому API render-server
 */
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
  avatar_settings: {
    heygen: {
      api_key: string
      avatar_id: string
      voice_id: string
      avatar_speech: string
    } | null
    hedra: {
      api_key: string
      avatar_photo_url: string
      avatar_id: string
      voice_id: string
      avatar_speech: string
    } | null
    fal: {
      api_key: string
      avatar_photo_url: string
      voice_id: string
      avatar_speech: string
      resolution?: '720p' | '1080p'
    } | null
  }
  callback_url: string | null
  bot_name?: string // Добавляем для определения бота при callback
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
    hasHeygenSettings: !!payload.avatar_settings.heygen,
    hasHedraSettings: !!payload.avatar_settings.hedra,
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
 * Отправляет событие НАПРЯМУЮ на render-server (Render Server)
 * Обходит Inngest Cloud и идет прямо на Render Server
 */
export async function sendDirectToRenderServer(
  payload: RenderRiddlePayload
): Promise<{ eventId: string }> {
  logger.info('🎬 [RENDER SERVER DIRECT] Sending direct request to Render Server', {
    jobId: payload.job_id,
    hasHeygenSettings: !!payload.avatar_settings.heygen,
    hasHedraSettings: !!payload.avatar_settings.hedra,
    url: RENDER_SERVER_URL,
  })

  try {
    const timestamp = Date.now()
    const eventData = {
      name: 'render-riddle',
      data: payload,
      ts: timestamp,
    }
    const body = JSON.stringify(eventData)

    // Создаем подпись для аутентификации
    const signingKey = process.env.RENDER_INNGEST_SIGNING_KEY
    if (!signingKey) {
      throw new Error('RENDER_INNGEST_SIGNING_KEY not configured')
    }

    const signature = createInngestSignature(body, signingKey, timestamp)

    const response = await fetch(`${RENDER_SERVER_URL}/api/inngest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-inngest-signature': `t=${timestamp},s=${signature}`,
        'x-inngest-sdk': 'js:2.0.0',
      },
      body: body,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Render-server responded with ${response.status}: ${errorText}`
      )
    }

    const result = await response.json()
    const eventId = `direct-${Date.now()}`

    logger.info('✅ [RENDER SERVER DIRECT] Event sent successfully', {
      jobId: payload.job_id,
      eventId,
      status: response.status,
    })

    return { eventId }
  } catch (error) {
    logger.error('❌ [RENDER SERVER DIRECT] Error sending direct request', {
      error: error instanceof Error ? error.message : String(error),
      jobId: payload.job_id,
      url: RENDER_SERVER_URL,
    })
    throw error
  }
}

/**
 * Валидирует voice_id и возвращает fallback если невалидный
 */
function validateVoiceId(voiceId: string): string {
  // Проверяем, что voice_id не пустой и соответствует формату ElevenLabs (обычно 20 символов)
  if (!voiceId || voiceId.length < 10) {
    logger.warn('[RENDER CLIENT] Invalid voice_id (too short), using fallback', {
      invalidVoiceId: voiceId,
      fallbackVoiceId: PRIMARY_FALLBACK_VOICE_ID
    })
    return PRIMARY_FALLBACK_VOICE_ID
  }

  // Проверяем, что это валидный формат (буквы и цифры)
  if (!/^[a-zA-Z0-9]+$/.test(voiceId)) {
    logger.warn('[RENDER CLIENT] Voice_id contains invalid characters, using fallback', {
      invalidVoiceId: voiceId,
      fallbackVoiceId: PRIMARY_FALLBACK_VOICE_ID
    })
    return PRIMARY_FALLBACK_VOICE_ID
  }

  return voiceId
}

/**
 * Создает payload для render-riddle из параметров бота
 * Поддерживает HeyGen и Hedra провайдеры
 *
 * @param telegramId - ID пользователя Telegram
 * @param text - Текст для озвучки аватара
 * @param avatarPhotoUrl - URL изображения для Hedra (игнорируется для HeyGen)
 * @param voiceId - ID голоса ElevenLabs
 * @param options - Дополнительные параметры
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
    callbackUrl?: string | null
    // Avatar service selection
    avatarService?: 'heygen' | 'hedra' | 'fal'
    // HeyGen specific
    heygenApiKey?: string
    heygenAvatarId?: string
    // Fal specific
    falApiKey?: string
    falResolution?: '720p' | '1080p'
    // Bot name для правильной отправки callback
    botName?: string
    // HeyGen набор аватаров для выбора API ключа
    heygenAvatarSet?: string
  }
): RenderRiddlePayload {
  // ✅ Валидируем voice_id и используем fallback если невалидный
  const validatedVoiceId = validateVoiceId(voiceId)

  const isHeygen = options?.avatarService === 'heygen'
  const isFal = options?.avatarService === 'fal'

  // HeyGen - выбираем API ключ в зависимости от набора аватаров
  let heygenApiKey = ''
  if (isHeygen) {
    // cocoage = шаблон 2 (кастомный)
    if (options?.heygenAvatarSet === 'cocoage') {
      heygenApiKey = process.env.HEYGEN_COCOAGE_API_KEY || ''
    }
    // haim = остальные шаблоны
    else {
      heygenApiKey = process.env.HEYGEN_HAIM_API_KEY || ''
    }
  }

  // ✅ ElevenLabs - ВСЕГДА используем НАШ ключ (для transcription нужны расширенные права)
  // Клиентский ключ HeyGen не имеет разрешения speech_to_text
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || ''

  logger.info('🎬 [RENDER PAYLOAD] Creating payload', {
    telegramId,
    avatarService: options?.avatarService || 'hedra',
    isHeygen,
    isFal,
    botName: options?.botName,
    hasHeygenApiKey: !!heygenApiKey,
    hasHeygenAvatarId: !!options?.heygenAvatarId,
    hasFalApiKey: !!options?.falApiKey,
    elevenLabsKeyType: 'default (our key with full permissions)',
  })

  return {
    job_id: `telegram-${telegramId}-${Date.now()}`,
    eleven_labs_api_key: elevenLabsApiKey,
    kie_api_key: process.env.KIE_AI_API_KEY || '',
    cover_url: options?.coverUrl || '',
    intro_text_1: {
      text: options?.introText1 || '',
      position: [540, 1135],
      font_size: 100,
    },
    intro_text_2: {
      text: options?.introText2 || '',
      position: [540, 1267],
      font_size: 75,
    },
    avatar_settings: {
      heygen: isHeygen
        ? {
            api_key: heygenApiKey, // Используем выбранный токен
            avatar_id: options?.heygenAvatarId || '',
            voice_id: validatedVoiceId,
            avatar_speech: text,
          }
        : null,
      hedra: !isHeygen && !isFal
        ? {
            api_key: process.env.HEDRA_API_KEY || '',
            avatar_photo_url: avatarPhotoUrl,
            avatar_id: `avatar-${telegramId}-${Date.now()}`,
            voice_id: validatedVoiceId,
            avatar_speech: text,
          }
        : null,
      fal: isFal
        ? {
            api_key: options?.falApiKey || process.env.FAL_API_KEY || '',
            avatar_photo_url: avatarPhotoUrl,
            voice_id: validatedVoiceId,
            avatar_speech: text,
            resolution: options?.falResolution || '720p',
          }
        : null,
    },
    callback_url:
      options?.callbackUrl !== undefined
        ? options.callbackUrl
        : process.env.BASE_WEBHOOK_URL
        ? `${process.env.BASE_WEBHOOK_URL}/api/video-callback/${telegramId}`
        : `http://212.86.115.30:2999/api/video-callback/${telegramId}`,
    bot_name: options?.botName,
  }
}
