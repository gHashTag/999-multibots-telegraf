import axios from 'axios'
import { logger } from '@/utils/logger'

/**
 * Клиент удалённого рендера (vibee-render на Railway, Remotion).
 *
 * Первый ЖИВОЙ мост бота к рендер-серверу: прежний путь
 * (`sendDirectToRenderServer`) не вызывался ниоткуда, а конвейер renderRiddle
 * рассчитан на списанную ферму nexrender — см.
 * .claude/skills/vibee-stack-hard-won. Здесь намеренно ПРЯМОЙ HTTP-вызов, без
 * Inngest: меньше швов — меньше мест, где задача уходит в пустоту.
 *
 * Сервер: POST /render → 202 {renderId}; GET /render/:id → {status, progress,
 * outputUrl, publicUrl}. Композиции проверяются на приёме (bundle-derived).
 */

/**
 * Адрес сервера. Пустая строка в конце цепочки НАМЕРЕННО: мёртвый литерал
 * превращает «не настроено» в «настроено на несуществующий хост», и отказ
 * становится молчаливым (класс three-head-dragon.shop, 19 вычищенных мест).
 */
function renderServerBaseUrl(): string {
  if (process.env.RENDER_SERVER_URL) return process.env.RENDER_SERVER_URL
  if (process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL)
    return `https://${process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL}`
  return ''
}

export interface RemoteRenderResult {
  renderId: string
  /** Абсолютная ссылка на готовый файл. */
  outputUrl: string
}

export async function renderOnServer(params: {
  compositionId: string
  inputProps: Record<string, unknown>
  /** Максимум ожидания готовности; рендер 18с видео занимает 2–5 минут. */
  timeoutMs?: number
}): Promise<RemoteRenderResult> {
  const base = renderServerBaseUrl().replace(/\/$/, '')
  if (!base) {
    throw new Error(
      'Рендер-сервер не настроен: нет ни RENDER_SERVER_URL, ни RAILWAY_SERVICE_VIBEE_RENDER_URL'
    )
  }

  const headers: Record<string, string> = {}
  if (process.env.RENDER_API_KEY) {
    // Именно X-Api-Key: сервер отвечает 401 на Authorization: Bearer —
    // проверено живым запросом («no X-Api-Key and no Telegram initData»).
    headers['X-Api-Key'] = process.env.RENDER_API_KEY
  }

  const submit = await axios.post(
    `${base}/render`,
    {
      type: 'video',
      compositionId: params.compositionId,
      inputProps: params.inputProps,
    },
    { headers, timeout: 30000, validateStatus: () => true }
  )

  if (submit.status !== 202 || !submit.data?.renderId) {
    // statusText на HTTP/2 пуст — в ошибку идут код и тело (hard-won).
    throw new Error(
      `Рендер-сервер отверг задачу: HTTP ${submit.status} ${JSON.stringify(submit.data).slice(0, 300)}`
    )
  }

  const renderId: string = submit.data.renderId
  logger.info('🎬 [RemoteRender] Задача принята', {
    renderId,
    compositionId: params.compositionId,
  })

  const deadline = Date.now() + (params.timeoutMs ?? 10 * 60 * 1000)
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(`Рендер ${renderId} не завершился за отведённое время`)
    }
    await new Promise(r => setTimeout(r, 5000))

    const st = await axios.get(`${base}/render/${renderId}`, {
      headers,
      timeout: 15000,
      validateStatus: () => true,
    })
    if (st.status !== 200) {
      throw new Error(
        `Статус рендера ${renderId}: HTTP ${st.status} ${JSON.stringify(st.data).slice(0, 200)}`
      )
    }

    const { status, progress, outputUrl, publicUrl, error } = st.data
    logger.info('🎬 [RemoteRender] Статус', { renderId, status, progress })

    if (status === 'failed') {
      throw new Error(`Рендер ${renderId} упал: ${error || 'причина не сообщена'}`)
    }
    if (status === 'completed') {
      const url: string | undefined =
        publicUrl || (outputUrl ? `${base}${outputUrl}` : undefined)
      if (!url) {
        // «Готово» без ссылки — это не готово. Успех без результата хуже
        // отказа: вызывающий отчитается человеку о видео, которого нет.
        throw new Error(`Рендер ${renderId} завершился без ссылки на файл`)
      }
      return { renderId, outputUrl: url }
    }
  }
}
