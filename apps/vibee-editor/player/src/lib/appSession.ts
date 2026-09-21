import { API_BASE } from '../config'
import { sessionStore, type SessionStore } from './framedSession'
import { isTelegram } from './telegram'

const ACCESS_KEY = 'trinity.app.session.access'
const REFRESH_KEY = 'trinity.app.session.refresh'
const EXPIRES_KEY = 'trinity.app.session.expires-at'
const REFRESH_EARLY_MS = 60_000

let refreshTimer: ReturnType<typeof setTimeout> | null = null
let refreshInFlight: Promise<AppSession> | null = null
let sessionGeneration = 0

export interface AppSession {
  access_token: string
  refresh_token: string
  expires_in: number
  telegram_user?: {
    id: number
    first_name: string
    last_name?: string
    username?: string
    photo_url?: string
    auth_date: number
  }
}

// The tab's sessionStorage, or this document's memory inside a frame by
// another site or where the browser refuses storage (lib/framedSession.ts).
const storage = (): SessionStore => sessionStore()

export function getAppAccessToken(): string {
  return storage()?.getItem(ACCESS_KEY) || ''
}

/** An access token whose stored expiry is still ahead. */
export function hasLiveAppSession(): boolean {
  const expiresAt = Number(storage()?.getItem(EXPIRES_KEY) || 0)
  return !!getAppAccessToken() && expiresAt > Date.now()
}

export function storeAppSession(session: AppSession): void {
  const s = storage()
  if (!s) return
  s.setItem(ACCESS_KEY, session.access_token)
  s.setItem(REFRESH_KEY, session.refresh_token)
  s.setItem(
    EXPIRES_KEY,
    String(Date.now() + Math.max(1, session.expires_in) * 1000)
  )
  scheduleRefresh()
}

export function clearAppSession(): void {
  // Invalidate every refresh response that started before this clear/logout.
  // A fetch cannot be reliably cancelled once the server has rotated the
  // token, so the response is allowed to finish but may no longer write.
  sessionGeneration += 1
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
  const s = storage()
  if (!s) return
  s.removeItem(ACCESS_KEY)
  s.removeItem(REFRESH_KEY)
  s.removeItem(EXPIRES_KEY)
}

function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
  const s = storage()
  const refresh = s?.getItem(REFRESH_KEY) || ''
  const expiresAt = Number(s?.getItem(EXPIRES_KEY) || 0)
  if (!refresh || !Number.isFinite(expiresAt) || expiresAt <= 0) return
  const delay = Math.max(0, expiresAt - Date.now() - REFRESH_EARLY_MS)
  refreshTimer = setTimeout(() => {
    void refreshAppSession().catch(() => clearAppSession())
  }, delay)
}

/** Resume rotation after a page reload without persisting tokens in the repo. */
export function resumeAppSessionRefresh(): void {
  scheduleRefresh()
}

/**
 * A SESSION KEPT ALIVE ONLY BY A TIMER IS A SESSION THAT DIES.
 *
 * Measured on production 2026-09-21. @SamHold (504608015) signed in on the web
 * three times inside forty minutes -- 16:38, 17:17, 17:20 UTC -- and between
 * those sign-ins the render log refuses the same two calls over and over --
 * GET /api/render-quota and GET /api/browser/session -- with one reason:
 * "session rejected: expired".
 *
 * Not "unknown", not "revoked": EXPIRED. He was holding a ten-minute access
 * token that nothing ever exchanged. Rotation had exactly one trigger -- the
 * `setTimeout` armed by `storeAppSession`, re-armed by
 * `resumeAppSessionRefresh` -- and that single call site is inside
 * `TelegramLoginButton`, a component that renders null inside Telegram and is
 * not mounted on most screens at all. So after a reload on any other page no
 * timer existed; and where one did, a sleeping laptop or a throttled
 * background tab is enough to miss it. A missed tick was permanent: nothing
 * refreshed on demand, so every later request was refused until the person
 * signed in by hand. From the outside that is exactly "sign-in does not work",
 * which is what the owner reported.
 *
 * The cure is to stop treating the timer as the only clock. This function is
 * the on-demand one: it is cheap while the token is live, it is deduplicated
 * by `refreshInFlight`, and it answers whether a request may proceed with a
 * credential at all.
 *
 * It returns false rather than throwing: a caller asking "can I still act as
 * this person" is entitled to a plain no, and the Mini App -- which
 * authenticates by signature and has no session at all -- must not treat that
 * no as an error.
 */
export async function ensureFreshSession(): Promise<boolean> {
  if (hasLiveAppSession()) return true
  return renewAppSession()
}

/**
 * Rotate now, whatever the stored expiry claims.
 *
 * For the caller who has just been told 401 by the server: the token it used
 * is spent, and the local clock saying otherwise is the thing that is wrong
 * (a machine that slept, a clock that drifted, a token revoked from another
 * device). False means there is nothing to rotate -- no session here, or the
 * refresh family itself is finished -- and the caller must not retry.
 */
export async function renewAppSession(): Promise<boolean> {
  if (!(storage()?.getItem(REFRESH_KEY) || '')) return false
  try {
    await refreshAppSession()
    return true
  } catch {
    return false
  }
}

/** The part of `window` session healing listens to. A plain object in tests. */
export interface HealingWindow {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

/**
 * Arm rotation for the whole application, not for one button.
 *
 * Called once at boot (main.tsx), so a reload on ANY screen re-arms the timer.
 * The three events are the moments a missed tick becomes visible: the tab
 * comes back from the background or from a sleeping machine, the window is
 * focused again, the network returns. Each asks `ensureFreshSession`, which
 * does nothing while the token is still live.
 *
 * Returns the unsubscribe, so a test can take its listeners back.
 */
export function startAppSessionHealing(
  win: HealingWindow | undefined = typeof window === 'undefined'
    ? undefined
    : (window as unknown as HealingWindow)
): () => void {
  scheduleRefresh()
  if (!win) return () => {}
  const heal = () => {
    void ensureFreshSession()
  }
  const events = ['visibilitychange', 'focus', 'online']
  for (const event of events) win.addEventListener(event, heal)
  return () => {
    for (const event of events) win.removeEventListener(event, heal)
  }
}

export async function refreshAppSession(): Promise<AppSession> {
  if (refreshInFlight) return refreshInFlight
  const refreshToken = storage()?.getItem(REFRESH_KEY) || ''
  if (!refreshToken) throw new Error('browser session is not available')
  const generation = sessionGeneration
  refreshInFlight = (async () => {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    const body = (await response
      .json()
      .catch(() => ({}))) as Partial<AppSession> & {
      error?: string
      detail?: string
    }
    /*
     * ГОНКА ВКЛАДОК: ЧИСТИТЬ СЕССИЮ ЗДЕСЬ — ЗНАЧИТ ВЫГНАТЬ ЧЕЛОВЕКА ЗРЯ.
     *
     * `refreshInFlight` — переменная модуля, то есть одна НА ВКЛАДКУ, а
     * refresh лежит в localStorage, общем для всех вкладок одного браузера.
     * Две открытые вкладки заводят таймер от одного и того же срока и приходят
     * обновляться с разницей в миллисекунды. Одна выигрывает и кладёт новый
     * токен в хранилище; вторая узнаёт об этом по 409.
     *
     * Ответ на 409 — перечитать хранилище, а не стирать его: победитель уже
     * положил туда то, что нужно. Одна попытка, без цикла: если там всё ещё
     * прежний токен, значит дело не в гонке, и общая ветка ниже отработает
     * честно.
     */
    if (response.status === 409 && body.error === 'auth_refresh_raced') {
      await new Promise(готово => setTimeout(готово, 400))
      const свежий = storage()?.getItem(REFRESH_KEY) || ''
      if (
        свежий &&
        свежий !== refreshToken &&
        generation === sessionGeneration
      ) {
        const access = getAppAccessToken()
        const expiresAt = Number(storage()?.getItem(EXPIRES_KEY) || 0)
        if (access) {
          const сессия: AppSession = {
            access_token: access,
            refresh_token: свежий,
            expires_in: Math.max(
              1,
              Math.round((expiresAt - Date.now()) / 1000)
            ),
          }
          // Записать, а не просто вернуть: `storeAppSession` заново заводит
          // таймер обновления. Без этого проигравшая вкладка дожила бы до
          // конца access-токена и больше не обновилась бы никогда.
          storeAppSession(сессия)
          return сессия
        }
      }
    }
    if (
      !response.ok ||
      typeof body.access_token !== 'string' ||
      typeof body.refresh_token !== 'string' ||
      typeof body.expires_in !== 'number'
    ) {
      clearAppSession()
      throw new Error(body.detail || body.error || `HTTP ${response.status}`)
    }
    const session = body as AppSession
    if (generation !== sessionGeneration) {
      throw new Error('browser session changed during refresh')
    }
    storeAppSession(session)
    return session
  })().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export async function logoutAppSession(): Promise<void> {
  const access = getAppAccessToken()
  const refresh = storage()?.getItem(REFRESH_KEY) || ''
  // Local logout is synchronous and fail-closed. A stalled network request or
  // a tab close must not leave a reusable browser credential behind.
  clearAppSession()
  if (!access && !refresh) return
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: JSON.stringify({ refresh_token: refresh }),
    })
  } catch {
    // The short-lived access token will expire server-side. Local credentials
    // are already gone, which is the security boundary this function owns.
  }
}

/**
 * SIGN OUT ON ALL DEVICES, INCLUDING THIS ONE.
 *
 * POST /api/auth/logout-all revokes every live session family of the person
 * and takes only a live Bearer access token (render session-routes.ts). Local
 * first, like logoutAppSession: this tab's credentials are gone before the
 * request starts, so a stalled network or a closed tab leaves nothing behind.
 * Resolves true only when the server confirmed.
 */
export async function logoutAllAppSessions(): Promise<boolean> {
  const access = getAppAccessToken()
  clearAppSession()
  if (!access) return false
  try {
    const response = await fetch(`${API_BASE}/api/auth/logout-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}` },
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Offered only for a browser session on the open web. Inside Telegram the
 * launch signs the person in again at once, so the action would promise what
 * it cannot keep on this device.
 */
export function canSignOutEverywhere(): boolean {
  return !!getAppAccessToken() && !isTelegram()
}

/**
 * ОБМЕНЯТЬ ПОДПИСЬ ЗАПУСКА НА СЕССИЮ ПРИЛОЖЕНИЯ.
 *
 * Заведено 07.09.2026. До этого `/api/auth/telegram` не звал НИКТО: ни
 * мини-апп, ни приложение на iOS, ни бот. Маршрут был написан, покрыт тестами,
 * задеплоен — и не имел ни одного посетителя. Весь мини-апп работал по
 * заголовку `X-Telegram-Init-Data` на каждом запросе.
 *
 * ЧЕГО ЭТО НЕ ДАЁТ, чтобы не обещать лишнего. Сессия НЕ делает личность внутри
 * Telegram отзываемой: `initData` живёт сутки по правилам Telegram, и пока она
 * жива, по ней выпускается новая сессия. Отзыв станет настоящим только вместе
 * с коротким окном приёма `initData` — это отдельная работа, и делать её надо
 * ПОСЛЕ того, как станет видно, что сессии вообще выпускаются.
 *
 * ЧТО ЭТО ДАЁТ УЖЕ СЕЙЧАС:
 *
 *  - у запроса появляется предъявитель, живущий десять минут, а не сутки;
 *  - обновление сессии (и гонка вкладок, и отзыв семьи) начинает работать для
 *    мини-аппа, а не только для веба;
 *  - отображение «один запуск — одна семья» (app_launch_families) перестаёт
 *    быть кодом без посетителей.
 *
 * ОТКАЗ НЕ ЛОМАЕТ НИЧЕГО. Не вышло — работаем ровно как вчера, по подписи.
 * Поэтому здесь нет ни одного `throw`: это добавка, а не замена.
 */
export async function exchangeTelegramLaunch(
  initData: string
): Promise<AppSession | null> {
  if (!initData) return null
  try {
    const response = await fetch(`${API_BASE}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_data: initData }),
    })
    const body = (await response
      .json()
      .catch(() => ({}))) as Partial<AppSession>
    if (
      !response.ok ||
      typeof body.access_token !== 'string' ||
      typeof body.refresh_token !== 'string' ||
      typeof body.expires_in !== 'number'
    ) {
      return null
    }
    const session = body as AppSession
    storeAppSession(session)
    return session
  } catch {
    // Сеть отвалилась — не повод трогать то, что уже работает.
    return null
  }
}

export async function exchangeTelegramWidget(
  payload: Record<string, unknown>
): Promise<AppSession> {
  const response = await fetch(`${API_BASE}/api/auth/widget`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = (await response
    .json()
    .catch(() => ({}))) as Partial<AppSession> & {
    error?: string
    detail?: string
  }
  if (
    !response.ok ||
    typeof body.access_token !== 'string' ||
    typeof body.refresh_token !== 'string'
  ) {
    throw new Error(body.detail || body.error || `HTTP ${response.status}`)
  }
  const session = body as AppSession
  storeAppSession(session)
  return session
}
