import { getInitData } from './telegram'
import { RENDER_URL } from '../config'
import { API_BASE } from '../config'
import { getAppAccessToken } from './appSession'

/**
 * Единственная дверь к рендер-серверу.
 *
 * Сервер работает в режиме enforce и требует X-Api-Key (сервер-серверу) либо
 * X-Telegram-Init-Data (мини-апп). Во всём приложении заголовок подписи ставил
 * РОВНО ОДИН вызов — история генераций бота. Остальные два десятка, включая
 * сам запуск рендера, уходили голыми и получали 401. Отсюда и «сделать шаблон
 * невозможно»: кнопка нажималась, запрос отвергался, а человеку показывался
 * общий текст ошибки.
 *
 * Подпись добавляется ко всем запросам к серверу и НЕ добавляется к чужим
 * адресам: initData — это удостоверение личности, и рассылать его куда попало
 * нельзя.
 */

const SERVER_ORIGINS = [RENDER_URL, API_BASE]
  .filter(Boolean)
  .map(u => u.replace(/\/+$/, ''))

const isOurServer = (url: string): boolean => {
  if (url.startsWith('/')) return true
  return SERVER_ORIGINS.some(origin => url.startsWith(origin))
}

export interface ApiError extends Error {
  status: number
  /** Причина от сервера: поле detail, если пришло. */
  detail?: string
  hint?: string
}

/** Заголовки с подписью. Пустая подпись не добавляется — незачем. */
export function authHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra)
  if (!h.has('Content-Type')) h.set('Content-Type', 'application/json')
  const initData = getInitData()
  if (initData) {
    h.set('X-Telegram-Init-Data', initData)
  } else {
    const accessToken = getAppAccessToken() // secret-guard-ok: runtime session value, never a literal credential
    if (accessToken) h.set('Authorization', `Bearer ${accessToken}`)
    else {
      /*
       * КЛЮЧ АГЕНТА — ТРЕТИЙ СПОСОБ, И ЕГО МЕСТО ЗДЕСЬ, А НЕ В КАЖДОМ ЭКРАНЕ.
       *
       * Этот файл называет себя единственной дверью к серверу, но ключ агента
       * дверь не знала. Поэтому его дописывали снаружи — десять раз, в десяти
       * компонентах, одной и той же строкой. Загрузка вложений его не
       * дописала, и получилось: чат работает, а фото к нему приложить нельзя.
       *
       * Симптом со стороны человека — «photo_….jpeg: загрузка не удалась».
       * Со стороны сервера, дословно из журнала прода:
       * «[auth] ОТКАЗ POST /upload — no X-Api-Key and no Telegram initData».
       * Запрос уходил вообще без удостоверения.
       *
       * Ветка стоит ПОСЛЕДНЕЙ: подпись мини-аппа и сессия приложения
       * принадлежат конкретному человеку, а ключ агента — способ для наладки
       * и внешних агентов. Сам ключ приходит из сборочного окружения, то есть
       * в прод-сборке его просто нет, и ветка там пустая.
       */
      const ключАгента = import.meta.env.DEV
        ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
        : undefined
      if (ключАгента) h.set('X-Agent-Key', ключАгента)
    }
  }
  return h
}

/**
 * fetch к нашему серверу с подписью и ЧЕСТНОЙ ошибкой.
 *
 * Ответ разбирается здесь, потому что во всём приложении статус не проверялся:
 * `await res.json()` на теле 401 давал объект без ожидаемых полей, и ветка
 * успеха молча уходила в else с общим сообщением. Теперь причина отказа
 * доезжает до вызывающего.
 *
 * Отдельно: statusText на HTTP/2 всегда пустой (Railway отдаёт только h2),
 * поэтому в сообщение идут код и тело, а не statusText.
 */
export async function apiFetch<T = unknown>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = isOurServer(url)
    ? authHeaders(init.headers)
    : new Headers(init.headers)

  const res = await fetch(url, { ...init, headers })
  const raw = await res.text()

  let parsed: unknown = undefined
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = undefined
    }
  }

  if (!res.ok) {
    const body = (parsed || {}) as {
      error?: string
      detail?: string
      hint?: string
    }
    const err = new Error(
      body.detail || body.error || `HTTP ${res.status}: ${raw.slice(0, 200)}`
    ) as ApiError
    err.status = res.status
    err.detail = body.detail
    err.hint = body.hint
    throw err
  }

  return parsed as T
}

/** Понятная человеку причина: 401 внутри мини-аппа — это не «ошибка сети». */
export function explainApiError(e: unknown): string {
  const err = e as ApiError
  if (err?.status === 401) {
    return err.detail
      ? `Сервер не подтвердил личность: ${err.detail}. Откройте приложение через кнопку меню бота.`
      : 'Сервер не подтвердил личность. Откройте приложение через кнопку меню бота.'
  }
  if (err?.status === 413) return 'Файл больше 100 МБ — сервер его не примет.'
  if (err?.status === 503)
    return 'Сервер ещё собирает бандл шаблонов. Попробуйте через минуту.'
  return err?.message || 'Неизвестная ошибка'
}
