/**
 * Render Server Client
 * Клиент для взаимодействия с render-server на Railway
 *
 * Server: https://vibee-render-production.up.railway.app
 * Inngest: https://vibee-render-production.up.railway.app/api/inngest
 * Functions: render, render-avatar-video, render-riddle
 *
 * Использует inngestProvider для управления RENDER инстансом
 */

import { logger } from '@/utils/logger'
import { inngestProvider } from './inngest-provider'
import { createHmac } from 'crypto'

logger.info('📦 [RENDER CLIENT] Module loaded, inngestProvider imported')

// render-v3-production.up.railway.app НЕ СУЩЕСТВУЕТ. Край Railway отвечает
// {"status":"error","code":404,"message":"Application not found"} на каждый
// путь, включая /health и /api/inngest — проверено запросами.
//
// То есть AI Reels и все задачи рендера уходили в никуда. Это не недавняя
// поломка: адресата не было. Отсюда и то, что рендер ни разу не доходил до
// чата — работа отправлялась хосту, которого никогда не было.
//
// vibee-render-production рядом отвечает {"status":"ok","bundleReady":true}.
// Переопределяется через VIBEE_RENDER_URL, чтобы следующий переезд не требовал
// правки кода.
const RENDER_SERVER_URL =
  process.env.VIBEE_RENDER_URL || 'https://vibee-render-production.up.railway.app'

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
 * Проверяет доступность render-server
 * Использует RENDER инстанс через inngestProvider
 */
export async function checkRenderServerAvailability(): Promise<boolean> {
  return await inngestProvider.checkAvailability('RENDER')
}

/**
 * Отправляет событие НАПРЯМУЮ на render-server (Railway)
 * Обходит Inngest Cloud и идет прямо на Railway
 */
export async function sendDirectToRenderServer(
  payload: RenderRiddlePayload
): Promise<{ eventId: string }> {
  logger.info('🎬 [RENDER SERVER DIRECT] Sending direct request to Railway', {
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

  logger.info('🎬 [RENDER PAYLOAD] Creating payload', {
    telegramId,
    avatarService: options?.avatarService || 'hedra',
    isHeygen,
    isFal,
    botName: options?.botName,
    hasHeygenApiKey: !!heygenApiKey,
    hasHeygenAvatarId: !!options?.heygenAvatarId,
    hasFalApiKey: !!options?.falApiKey,
  })

  return {
    job_id: `telegram-${telegramId}-${Date.now()}`,
    eleven_labs_api_key: process.env.ELEVENLABS_API_KEY || '',
    kie_api_key: process.env.KIE_AI_API_KEY || '',
    cover_url: options?.coverUrl || '',
    intro_text_1: {
      text: options?.introText1 || '',
      position: [540, 860],
      font_size: 100,
    },
    intro_text_2: {
      text: options?.introText2 || '',
      position: [540, 960],
      font_size: 75,
    },
    avatar_settings: {
      heygen: isHeygen
        ? {
            api_key: heygenApiKey, // Используем выбранный токен
            avatar_id: options?.heygenAvatarId || '',
            voice_id: voiceId,
            avatar_speech: text,
          }
        : null,
      hedra: !isHeygen && !isFal
        ? {
            api_key: process.env.HEDRA_API_KEY || '',
            avatar_photo_url: avatarPhotoUrl,
            avatar_id: `avatar-${telegramId}-${Date.now()}`,
            voice_id: voiceId,
            avatar_speech: text,
          }
        : null,
      fal: isFal
        ? {
            api_key: options?.falApiKey || process.env.FAL_API_KEY || '',
            avatar_photo_url: avatarPhotoUrl,
            voice_id: voiceId,
            avatar_speech: text,
            resolution: options?.falResolution || '720p',
          }
        : null,
    },
    // Адрес, КУДА ВЕРНЁТСЯ ГОТОВОЕ ВИДЕО. Здесь был зашит
    // three-head-dragon.shop — старый сервер (188.137.250.69), отвечающий
    // HTTP 000 по всем протоколам.
    //
    // Ни один из четырёх render-визардов не передаёт callbackUrl (grep
    // "callbackUrl" по src/scenes/ пуст), поэтому ветка с мёртвым доменом
    // бралась ВСЕГДА. При этом визарды списывают звёзды и пишут «вы получите
    // уведомление когда видео будет готово». Готовый ролик уходил в никуда.
    //
    // process.env читается ЗДЕСЬ, а не через импортируемую константу из
    // config: config/index.ts вычисляет свои значения на импорте модуля, а
    // секреты в этом проекте подтягиваются из Infisical позже — константа
    // могла бы застыть как undefined.
    callback_url:
      options?.callbackUrl !== undefined
        ? options.callbackUrl
        : process.env.BASE_WEBHOOK_URL
          // bot_name кладётся В САМ URL. Иначе он теряется: sendCallback
          // (functions/render/helpers/renderSteps.ts:315) шлёт ровно
          // { download_url } и никаких метаданных, а render.ts знает только
          // job_id и callback_url. Здесь же бот известен достоверно — это тот
          // бот, в котором человек заказал видео.
          ? `${process.env.BASE_WEBHOOK_URL}/api/telegram/ai-reels-callback` +
            (options?.botName ? `?bot=${encodeURIComponent(options.botName)}` : '')
          // undefined, а НЕ null. Схема объявляет callback_url как
          // z.string().url().optional() (schemas.ts), а .optional() принимает
          // undefined и отвергает null: "Expected string, received null".
          // Я поставил здесь null в прошлом цикле и добавил девятую причину
          // отказа валидации к восьми уже существующим. Проверено прогоном
          // RenderRiddleEventDataSchema.safeParse по этому payload.
          : undefined,
    bot_name: options?.botName,
  }
}
