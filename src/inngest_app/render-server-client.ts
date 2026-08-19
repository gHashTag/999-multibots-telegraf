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
import { RenderRiddleEventDataSchema } from '@/inngest_app/functions/render/schemas'
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
  cover_url?: string
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
  // Плоская форма — та, что объявлена AvatarSettingsSchema (schemas.ts:21)
  // и та, что читает renderRiddle (renderRiddle.ts:140-188).
  avatar_settings: {
    avatar_speech: string
    voice_id?: string
    avatar_photo_url?: string
    avatar_id?: string
    api_key: string
  }
  avatar_gen_service: 'hedra' | 'heygen' | 'fal'
  heygen_api_key?: string
  circle_position: [number, number, number]
  circle_scale: [number, number, number]
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
    hasHeygenSettings: payload.avatar_gen_service === 'heygen',
    hasHedraSettings: payload.avatar_gen_service === 'hedra',
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
    hasHeygenSettings: payload.avatar_gen_service === 'heygen',
    hasHedraSettings: payload.avatar_gen_service === 'hedra',
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
    circlePosition?: [number, number, number]
    circleScale?: [number, number, number]
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

  const payload: RenderRiddlePayload = {
    job_id: `telegram-${telegramId}-${Date.now()}`,
    eleven_labs_api_key: process.env.ELEVENLABS_API_KEY || '',
    kie_api_key: process.env.KIE_AI_API_KEY || '',
    // undefined, а не '': схема объявляет cover_url как z.string().url(),
    // и пустая строка её не проходит.
    cover_url: options?.coverUrl || undefined,
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
    // ПЛОСКАЯ форма, а не { heygen, hedra, fal }.
    //
    // Вложенную форму не потребляет никто: renderRiddle читает
    // data.avatar_settings.avatar_speech / .voice_id / .avatar_photo_url /
    // .api_key / .avatar_id напрямую (renderRiddle.ts:140-188), и ровно это
    // объявляет AvatarSettingsSchema (schemas.ts:21-27). То есть схема и
    // потребитель согласны между собой, а расходился с ними сборщик payload.
    //
    // Проверено прогоном RenderRiddleEventDataSchema.safeParse: до этой правки
    // payload не проходил валидацию по восьми пунктам, и renderRiddle.ts:57
    // бросал на первой же строке — раньше любых трат.
    avatar_settings: {
      avatar_speech: text,
      voice_id: voiceId,
      api_key: isHeygen
        ? heygenApiKey
        : isFal
          ? options?.falApiKey || process.env.FAL_API_KEY || ''
          : process.env.HEDRA_API_KEY || '',
      // Hedra и Fal работают от фото, HeyGen — от готового аватара.
      ...(isHeygen
        ? { avatar_id: options?.heygenAvatarId || '' }
        : {
            avatar_photo_url: avatarPhotoUrl || undefined,
            avatar_id: `avatar-${telegramId}-${Date.now()}`,
          }),
    },
    // Схема требует эти три поля, а сборщик их не клал вовсе.
    // avatar_gen_service: 'fal' схемой НЕ принимается, и это не опечатка —
    // renderRiddle не имеет ветки для fal (есть только hedra и heygen,
    // renderRiddle.ts:111 и :143). Пока ветки нет, fal-задачи должны
    // отвергаться валидацией громко, а не проходить и падать глубже.
    avatar_gen_service: isHeygen ? 'heygen' : isFal ? 'fal' : 'hedra',
    // Схема требует heygen_api_key ОТДЕЛЬНЫМ полем верхнего уровня, помимо
    // avatar_settings.api_key: у неё есть refine «HeyGen requires
    // heygen_api_key». Поле не заполнялось вовсе.
    heygen_api_key: isHeygen ? heygenApiKey || undefined : undefined,
    // ТРИ числа кортежем, а не { x, y }: схема объявляет их как
    // z.tuple([z.number(), z.number(), z.number()]) (schemas.ts:13).
    circle_position: options?.circlePosition ?? [0.5, 0.5, 0],
    circle_scale: options?.circleScale ?? [1, 1, 1],
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

  // ПРОВЕРКА ЗДЕСЬ, СИНХРОННО, ДО СПИСАНИЯ.
  //
  // Все четыре визарда сначала списывают деньги, потом отправляют событие, и
  // только потом renderRiddle.ts:57 валидирует вход — асинхронно, в другом
  // процессе. Отправка события при этом ПРОХОДИТ УСПЕШНО, поэтому try/catch
  // визарда отказ не видит: человеку уже написано «💰 Списано», а задача
  // отвергнута там, куда визард не смотрит.
  //
  // Эта функция вызывается ДО списания во всех четырёх. Бросок отсюда попадает
  // в catch визарда, деньги остаются на месте, и человек получает причину, а
  // не тишину.
  const check = RenderRiddleEventDataSchema.safeParse(payload)
  if (!check.success) {
    const why = check.error.issues
      .map(i => `${i.path.join('.') || '(корень)'}: ${i.message}`)
      .join('; ')
    logger.error('❌ [RENDER PAYLOAD] Payload не проходит схему render-riddle', {
      telegramId,
      avatarService: options?.avatarService,
      issues: why,
    })
    throw new Error(`Задача не может быть выполнена: ${why}`)
  }

  return payload
}
