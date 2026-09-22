// ===============================
// User Atom - Telegram Auth State
// Freemium model: 3 free renders
// ===============================

import { atom } from 'jotai'
import { atomWithStorage, createJSONStorage } from 'jotai/utils'
import { STORAGE_KEYS } from '@vibee/atoms'
import { API_BASE } from '../config'
import { authHeaders } from '../lib/apiFetch'
import {
  APP_SESSION_CLEARED,
  APP_SESSION_PERSON,
  logoutAppSession,
} from '../lib/appSession'
import { editorStore } from './Provider'
import { sessionStore } from '../lib/framedSession'

// Import shared types from @vibee/atoms
import type {
  TelegramUser,
  RenderQuota,
  SubscriptionInfo,
  InstagramStatus,
} from '@vibee/atoms'

// Re-export types for backward compatibility
export type { TelegramUser, RenderQuota, SubscriptionInfo, InstagramStatus }

/*
 * The signed-in person, kept BESIDE their access token: the tab's
 * sessionStorage, or memory inside a frame by another site (framedSession.ts).
 *
 * Kept together on purpose. A first version moved the person to localStorage
 * so a new tab would show them at once; a new tab then held a person with no
 * token, Header's guest sweep answered that with a logout, and the logout --
 * now carrying the refresh cookie -- revoked the whole family. So the person
 * never outruns the token: a renewed cookie session brings them with it
 * (APP_SESSION_PERSON), and they leave with it (APP_SESSION_CLEARED).
 */
export const userAtom = atomWithStorage<TelegramUser | null>(
  STORAGE_KEYS.user,
  null,
  createJSONStorage(() => sessionStore())
)

/*
 * These write to editorStore, the store the app is rendered from
 * (atoms/Provider.tsx). A first version wrote to jotai's default store, which
 * nothing renders, so the header never heard.
 */
if (typeof window !== 'undefined') {
  // A session that ends takes the person with it: without this the header
  // kept the avatar with neither Login nor Logout, and every action got 401.
  window.addEventListener(APP_SESSION_CLEARED, () => {
    editorStore.set(userAtom, null)
  })
  // A session renewed in a tab that has never seen the person brings them.
  // The same person already here is kept as is (it may know more, is_admin
  // among it). A DIFFERENT person means the token now acts as someone else --
  // the browser has one cookie, and another tab signed in as another account
  // -- so the header must show who the requests really are (review,
  // 2026-09-22: the first version kept the old name over the new token).
  window.addEventListener(APP_SESSION_PERSON, event => {
    const person = (event as CustomEvent<TelegramUser>).detail
    if (!person || typeof person.id !== 'number') return
    const here = editorStore.get(userAtom)
    if (here && Number(here.id) === person.id) return
    editorStore.set(userAtom, { ...person, is_admin: false })
  })
}

// Render quota (not persisted - fetched from API)
export const renderQuotaAtom = atom<RenderQuota | null>(null)

// Loading state
export const quotaLoadingAtom = atom<boolean>(false)

// Paywall modal visibility
export const showPaywallAtom = atom<boolean>(false)

// Login modal visibility
export const showLoginModalAtom = atom<boolean>(false)

/**
 * WHY THE MODAL NEEDS TO BE TOLD WHY IT WAS OPENED.
 *
 * Seven places open it: the timeline's export, the four generate actions, two
 * follow buttons, the framed board, the return from the board's sign-in chip
 * and the header. It showed one headline to all of them -- "Login to Export" --
 * over a subtitle promising three free video renders. That sentence is true at
 * exactly one of those doors. Somebody who pressed "Sign in" on their clients
 * board was told to log in to export a video, and offered renders they had not
 * asked for.
 *
 * So the door says which door it is, and the modal answers in its words. Null
 * is the honest general case -- the header's own Login button has no ulterior
 * purpose, and inventing one would be the same lie in a new coat.
 */
export type LoginReason = 'export' | 'generate' | 'follow' | 'board'

export const loginReasonAtom = atom<LoginReason | null>(null)

/**
 * ONE WRITER, BECAUSE TWO ATOMS SET SEPARATELY GO STALE.
 *
 * A door that sets `showLoginModalAtom` and forgets the reason inherits the
 * previous door's sentence -- a Follow showing the export copy. That is the
 * same defect this reason exists to remove, reintroduced by the fix for it.
 * Every door goes through here, and closing clears the reason so nothing
 * survives into the next opening.
 */
export const openLoginAtom = atom(
  null,
  (_get, set, reason: LoginReason | null) => {
    set(loginReasonAtom, reason)
    set(showLoginModalAtom, true)
  }
)

export const closeLoginAtom = atom(null, (_get, set) => {
  set(showLoginModalAtom, false)
  set(loginReasonAtom, null)
})

// Fetch render quota from API (also updates is_admin status)
export const fetchQuotaAtom = atom(null, async (get, set) => {
  const user = get(userAtom)

  if (!user) {
    set(renderQuotaAtom, null)
    return
  }

  set(quotaLoadingAtom, true)
  try {
    // Signed: /api/render-quota is not on any PUBLIC list and the render
    // server runs in enforce mode on Railway, so an unsigned request 401s --
    // which is why the quota chip never appeared in production.
    const response = await fetch(`${API_BASE}/api/render-quota`, {
      headers: authHeaders(),
    })

    if (response.ok) {
      const data = await response.json()
      set(renderQuotaAtom, data)

      // Only sync is_admin if it actually changed (prevents infinite loop!)
      if (data.is_admin !== undefined && data.is_admin !== user.is_admin) {
        set(userAtom, { ...user, is_admin: data.is_admin })
      }
    }
  } catch (error) {
    console.error('[fetchQuota] Failed to fetch render quota:', error)
  } finally {
    set(quotaLoadingAtom, false)
  }
})

// Log a render to the API
export const logRenderAtom = atom(null, async (get, set) => {
  const user = get(userAtom)
  if (!user) return false
  // Admission is counted atomically by POST /render. The old unsigned
  // The former client-side logging endpoint never existed and let the client
  // invent usage.
  await set(fetchQuotaAtom)
  return true
})

// Check if running in development mode
// Supports: localhost, Replit, Gitpod, CodeSandbox, StackBlitz, Vercel preview
const isDev =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.endsWith('.replit.dev') ||
    window.location.hostname.endsWith('.repl.co') ||
    window.location.hostname.endsWith('.gitpod.io') ||
    window.location.hostname.endsWith('.csb.app') || // CodeSandbox
    window.location.hostname.endsWith('.stackblitz.io') ||
    window.location.hostname.endsWith('.webcontainer.io') ||
    window.location.hostname.includes('-preview') || // Vercel/Fly preview
    import.meta.env.DEV === true) // Vite dev mode

// Check if user can render (has quota)
// DEV MODE: Unlimited renders for local development
// ADMIN MODE: Unlimited renders for admins in production
export const canRenderAtom = atom(get => {
  const user = get(userAtom)
  const quota = get(renderQuotaAtom)

  console.log('[canRender] Checking render permission:', {
    isDev,
    user: user ? { id: user.id, is_admin: user.is_admin } : null,
    quota: quota,
  })

  // DEV MODE: Always allow renders on localhost
  if (isDev) {
    console.log('[canRender] ALLOWED: dev mode')
    return true
  }

  // ADMIN MODE: Always allow renders for admins
  if (user?.is_admin) {
    console.log('[canRender] ALLOWED: admin mode')
    return true
  }

  // Not logged in - can try for free
  if (!user) {
    console.log('[canRender] ALLOWED: not logged in (free try)')
    return true
  }

  // No quota loaded yet - allow
  if (!quota) {
    console.log('[canRender] ALLOWED: no quota loaded yet')
    return true
  }

  // Has free renders remaining
  if (quota.free_remaining > 0) {
    console.log(
      '[canRender] ALLOWED: free renders remaining:',
      quota.free_remaining
    )
    return true
  }

  // Has subscription with remaining renders
  if (quota.subscription) {
    if (quota.subscription.remaining === null) {
      console.log('[canRender] ALLOWED: unlimited subscription')
      return true // Unlimited
    }
    if (quota.subscription.remaining > 0) {
      console.log(
        '[canRender] ALLOWED: subscription remaining:',
        quota.subscription.remaining
      )
      return quota.subscription.remaining > 0
    }
  }

  console.log('[canRender] DENIED: no quota, not admin, not dev')
  return false
})

// Export isDev for use in other components
export const isDevModeAtom = atom(isDev)

// Check if user has unlimited renders (dev or admin)
export const hasUnlimitedRendersAtom = atom(get => {
  if (isDev) return true
  const user = get(userAtom)
  return user?.is_admin === true
})

// Logout action
export const logoutAtom = atom(null, (_get, set) => {
  void logoutAppSession()
  set(userAtom, null)
  set(renderQuotaAtom, null)
  set(showPaywallAtom, false)
  set(instagramStatusAtom, null)
})

// ===============================
// Instagram Connection State
// ===============================

// Instagram connection status (not persisted - fetched from API)
export const instagramStatusAtom = atom<InstagramStatus | null>(null)
export const instagramLoadingAtom = atom<boolean>(false)

// Fetch Instagram connection status
export const fetchInstagramStatusAtom = atom(null, async (get, set) => {
  const user = get(userAtom)
  if (!user) {
    set(instagramStatusAtom, null)
    return
  }

  set(instagramLoadingAtom, true)
  try {
    const response = await fetch(
      `${API_BASE}/api/instagram/status?telegram_id=${user.id}`
    )
    if (response.ok) {
      const data = await response.json()
      set(instagramStatusAtom, data)
    } else {
      /**
       * ТРЕТЬЕ состояние: сервер про Instagram не знает вовсе.
       *
       * Раньше здесь стоял `if (response.ok)` без else, и отказ не менял
       * ничего. Человек открывал публикацию, видел кнопку «Подключить
       * Instagram», жал — и не происходило РОВНО НИЧЕГО: ни ошибки, ни
       * окна, ни второй попытки. Сколько угодно раз подряд.
       *
       * Причина не в сети: во всём render-server.ts слова instagram нет
       * ни разу, а клиент зовёт пять таких адресов. Интеграции просто нет.
       *
       * «Не подключено» и «подключить некуда» — разные вещи, и путать их
       * жестоко: первое человек может исправить, второе нет. Поэтому
       * отличаем и показываем честно, а кнопку не рисуем вовсе.
       */
      set(instagramStatusAtom, {
        connected: false,
        unavailable: true,
        reason: `сервер ответил ${response.status}`,
      })
    }
  } catch (error) {
    // Сеть могла и правда отвалиться — это НЕ то же самое, что «нет
    // интеграции», и обещать человеку лишнего мы не будем.
    console.error('Failed to fetch Instagram status:', error)
    set(instagramStatusAtom, {
      connected: false,
      unavailable: true,
      reason: 'сервис не ответил',
    })
  } finally {
    set(instagramLoadingAtom, false)
  }
})

// Get Instagram OAuth URL and redirect
export const connectInstagramAtom = atom(null, async get => {
  const user = get(userAtom)
  if (!user) return null

  try {
    const response = await fetch(
      `${API_BASE}/api/instagram/auth-url?telegram_id=${user.id}`
    )
    if (response.ok) {
      const data = await response.json()
      // Open Instagram OAuth in new window
      window.open(data.auth_url, '_blank', 'width=600,height=700')
      return data.auth_url
    }
  } catch (error) {
    console.error('Failed to get Instagram auth URL:', error)
  }
  return null
})

// Disconnect Instagram account
export const disconnectInstagramAtom = atom(null, async (get, set) => {
  const user = get(userAtom)
  if (!user) return false

  try {
    const response = await fetch(`${API_BASE}/api/instagram/disconnect`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_id: user.id }),
    })

    if (response.ok) {
      set(instagramStatusAtom, { connected: false })
      return true
    }
  } catch (error) {
    console.error('Failed to disconnect Instagram:', error)
  }
  return false
})

// Post to user's Instagram account
export const postToInstagramAtom = atom(
  null,
  async (
    get,
    _set,
    { videoUrl, caption }: { videoUrl: string; caption?: string }
  ) => {
    const user = get(userAtom)
    if (!user) return { success: false, error: 'Not logged in' }

    try {
      const response = await fetch(`${API_BASE}/api/instagram/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: user.id,
          video_url: videoUrl,
          caption: caption || '',
        }),
      })

      const data = await response.json()
      if (response.ok) {
        return { success: true, media_id: data.media_id }
      }
      return { success: false, error: data.error || 'Failed to post' }
    } catch (error) {
      console.error('Failed to post to Instagram:', error)
      return { success: false, error: 'Network error' }
    }
  }
)
