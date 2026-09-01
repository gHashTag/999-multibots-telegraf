import { API_BASE } from '../config'

const ACCESS_KEY = 'trinity.app.session.access'
const REFRESH_KEY = 'trinity.app.session.refresh'
const EXPIRES_KEY = 'trinity.app.session.expires-at'
const REFRESH_EARLY_MS = 60_000

let refreshTimer: ReturnType<typeof setTimeout> | null = null
let refreshInFlight: Promise<AppSession> | null = null

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

const storage = () =>
  typeof window === 'undefined' ? null : window.sessionStorage

export function getAppAccessToken(): string {
  return storage()?.getItem(ACCESS_KEY) || ''
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

export async function refreshAppSession(): Promise<AppSession> {
  if (refreshInFlight) return refreshInFlight
  const refreshToken = storage()?.getItem(REFRESH_KEY) || ''
  if (!refreshToken) throw new Error('browser session is not available')
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
    storeAppSession(session)
    return session
  })().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export async function logoutAppSession(): Promise<void> {
  const access = getAppAccessToken()
  try {
    if (access) {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}` },
      })
    }
  } finally {
    clearAppSession()
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
