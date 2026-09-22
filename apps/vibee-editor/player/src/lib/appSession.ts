import { API_BASE } from '../config'
import {
  sessionStore,
  sessionTrustedIn,
  type FramedWindow,
  type SessionStore,
} from './framedSession'
import { isTelegram } from './telegram'

const ACCESS_KEY = 'trinity.app.session.access'
const REFRESH_KEY = 'trinity.app.session.refresh'
const EXPIRES_KEY = 'trinity.app.session.expires-at'
const REFRESH_EARLY_MS = 60_000

/*
 * THE REFRESH TOKEN LIVES IN AN HttpOnly COOKIE, NOT IN THIS TAB.
 *
 * Measured 2026-09-22: the 60-day refresh token sat in the tab's sessionStorage
 * (since 215480af6, 2026-09-01), so every new tab, bookmark, Telegram link and
 * fresh browser start was signed out while the server would have honoured the
 * family for 60 days -- the owner's "I have to log in every time". The render
 * now hands it over as an HttpOnly cookie on app.t27.ai when asked (render
 * src/auth/refresh-cookie.ts): the jar keeps it across tabs and restarts, and
 * no script can read it, which is stricter than either Web Storage.
 *
 * The cookie only exists where nginx proxies /api/auth/ same-origin, so the
 * auth doors are called on app.t27.ai itself there, and on API_BASE as before
 * everywhere else (a dev server, a frame this app does not trust).
 */
export const APP_ORIGIN = 'https://app.t27.ai'
const SESSION_TRANSPORT_HEADER = 'X-Session-Transport'

/*
 * WHERE THE COOKIE LIVES: auth.t27.ai, the render's own custom domain.
 *
 * Empty turns cookie transport off, and this build signs in exactly as before
 * -- which is the state it ships in until auth.t27.ai answers. A first version
 * reached the render through an nginx hop on app.t27.ai; Railway's edge
 * replaces X-Forwarded-For (measured), so that put every person behind the
 * ten-a-minute sign-in brake as one. auth.t27.ai is on the same site as the
 * app, so its cookie is first-party, and the browser reaches it through one
 * edge (render src/auth/refresh-cookie.ts).
 */
const AUTH_ORIGIN: string = String(
  (import.meta.env as Record<string, string | undefined>).VITE_AUTH_ORIGIN ?? ''
).replace(/\/+$/, '')

/**
 * Not a credential: only "a cookie session may be in the jar, try a silent
 * refresh". Without it every anonymous visitor would spend a refresh -- and a
 * share of the sign-in brake's ten attempts a minute -- on every page load.
 * localStorage so a new tab sees it; the token itself is never here.
 */
const COOKIE_MARKER_KEY = 'trinity.app.session.cookie'

/**
 * Where cookie transport works: app.t27.ai, top-level or framed only by
 * app.t27.ai itself (the board at app.t27.ai/queen/).
 *
 * Stricter than sessionTrustedIn, which also admits Telegram's frames. A
 * SameSite=Strict cookie is not sent from inside a frame on another site, so
 * in Telegram Web -- app.t27.ai framed by web.telegram.org -- a cookie session
 * could be minted but never spent, and the refresh would retry for nothing.
 * There the Mini App signs in from initData on every launch anyway, and keeps
 * the tab's store as before.
 */
export function cookieTransportAvailable(): boolean {
  if (!AUTH_ORIGIN) return false
  if (typeof window === 'undefined') return false
  if (window.location.origin !== APP_ORIGIN) return false
  const win = window as unknown as FramedWindow
  if (win.self === win.top) return true
  if (!sessionTrustedIn(win)) return false
  const list = win.location.ancestorOrigins
  return !!list && Array.from(list).every(origin => origin === APP_ORIGIN)
}

function readMarker(): boolean {
  try {
    return window.localStorage.getItem(COOKIE_MARKER_KEY) === '1'
  } catch {
    return false
  }
}

function writeMarker(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(COOKIE_MARKER_KEY, '1')
    else window.localStorage.removeItem(COOKIE_MARKER_KEY)
  } catch {
    // A browser that refuses storage still keeps the cookie; it only loses the
    // hint, so a new tab signs in again, which is where it was before.
  }
}

/*
 * A SIGN-OUT THAT DID NOT REACH THE SERVER IS NOT FINISHED.
 *
 * Only the render's reply can take an HttpOnly cookie out of the jar; no
 * script here can read or delete it. So a logout whose request was lost --
 * no network, the tab closed first -- left a live 60-day credential in the
 * browser and its family open on the server. The flag says "finish it", and
 * the next boot sends the logout again before anything else.
 */
const LOGOUT_PENDING_KEY = 'trinity.app.session.logout-pending'

function setLogoutPending(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(LOGOUT_PENDING_KEY, '1')
    else window.localStorage.removeItem(LOGOUT_PENDING_KEY)
  } catch {
    // Without storage the retry is lost; the cookie still expires on its own.
  }
}

function logoutPending(): boolean {
  try {
    return window.localStorage.getItem(LOGOUT_PENDING_KEY) === '1'
  } catch {
    return false
  }
}

/** Send the cookie's logout; true when the server confirmed. */
async function sendCookieLogout(access: string): Promise<boolean> {
  try {
    const response = await fetch(authUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: authCredentials(),
      headers: authHeaders({
        'Content-Type': 'application/json',
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      }),
      body: '{}',
    })
    // 401 means nothing is left to revoke: finished, just as 200 is.
    return response.ok || response.status === 401
  } catch {
    return false
  }
}

/** Send a pending cookie logout once; clear the flag when it is confirmed. */
let finishingLogout: Promise<void> | null = null
function finishPendingLogout(): Promise<void> {
  if (finishingLogout) return finishingLogout
  finishingLogout = sendCookieLogout('')
    .then(done => {
      if (done) setLogoutPending(false)
    })
    .finally(() => {
      finishingLogout = null
    })
  return finishingLogout
}

/** A cookie session is believed to exist in this browser. */
export function hasCookieSession(): boolean {
  return cookieTransportAvailable() && readMarker()
}

/** The URL of an auth door: auth.t27.ai under cookie transport. */
export function authUrl(path: string): string {
  return cookieTransportAvailable()
    ? `${AUTH_ORIGIN}${path}`
    : `${API_BASE}${path}`
}

/**
 * Credentials for an auth request. `include` only under cookie transport: the
 * old API host answers `Access-Control-Allow-Origin: *`, and a browser refuses
 * the reply to a credentialed request answered that way -- so sending cookies
 * there would break the very sign-in that works today.
 */
export function authCredentials(): RequestCredentials {
  return cookieTransportAvailable() ? 'include' : 'same-origin'
}

/** Headers an auth request carries: the opt-in under cookie transport. */
export function authHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  return cookieTransportAvailable()
    ? { ...extra, [SESSION_TRANSPORT_HEADER]: 'cookie' }
    : extra
}

/**
 * A failure that says nothing about whether the session is still good: the
 * brake answered 429, the render answered 5xx during a deploy, the network was
 * not up yet after the laptop woke. These used to clear the session, which is
 * how a valid 60-day sign-in was thrown away by one bad minute. They are now
 * surfaced as this, and the session is left alone to be tried again.
 */
export class TransientSessionError extends Error {}

let refreshTimer: ReturnType<typeof setTimeout> | null = null
let refreshInFlight: Promise<AppSession> | null = null
let sessionGeneration = 0

export interface AppSession {
  access_token: string
  /** Absent when the server put it in the HttpOnly cookie instead. */
  refresh_token?: string
  /** "cookie" when the refresh token went to the jar (render). */
  refresh_transport?: 'cookie'
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

/**
 * A session that can be brought back to life: a refresh token is stored. The
 * access token beside it may have expired while no page was open to renew it
 * (lib/sessionRenewal.ts renews it before the next request).
 */
export function hasRenewableAppSession(): boolean {
  return !!storage()?.getItem(REFRESH_KEY) || hasCookieSession()
}

/**
 * Keep a session in this tab. `signIn` is true only for a door the person
 * walked through (the Login Widget, a Telegram launch), never for a refresh:
 *
 *   - a sign-in starts a new session, so a refresh still in flight from the
 *     old one must not write over it (sessionGeneration);
 *   - only a sign-in that put a NEW cookie in the jar supersedes a sign-out
 *     that has not reached the server yet. A refresh used to clear that flag
 *     too, so another tab's rotation landing just after "Sign out" cancelled
 *     it and the family lived on (review, 2026-09-22).
 */
export function storeAppSession(
  session: AppSession,
  { signIn = false }: { signIn?: boolean } = {}
): void {
  const s = storage()
  if (!s) return
  if (signIn) sessionGeneration += 1
  resetRefreshBackoff()
  s.setItem(ACCESS_KEY, session.access_token)
  if (session.refresh_transport === 'cookie' || !session.refresh_token) {
    // The token is in the jar. Drop any copy an older reply left in this tab:
    // the jar is now the one place it lives.
    s.removeItem(REFRESH_KEY)
    writeMarker(true)
    // A new sign-in supersedes a sign-out that never finished: its cookie has
    // just replaced the old one in the jar, and finishing the old logout at
    // the next boot would revoke THIS session instead.
    if (signIn) setLogoutPending(false)
  } else {
    // A server that did not answer with a cookie (an older render mid-deploy,
    // a context without cookie transport): keep it where it always was, so
    // the order in which the two services deploy does not matter.
    s.setItem(REFRESH_KEY, session.refresh_token)
  }
  s.setItem(
    EXPIRES_KEY,
    String(Date.now() + Math.max(1, session.expires_in) * 1000)
  )
  scheduleRefresh()
}

/** Fired when the session is cleared for good; atoms/user.ts listens. */
export const APP_SESSION_CLEARED = 'trinity:app-session-cleared'

/** Fired with the person a renewed session belongs to; atoms/user.ts listens. */
export const APP_SESSION_PERSON = 'trinity:app-session-person'

export function clearAppSession(): void {
  // Invalidate every refresh response that started before this clear/logout.
  // A fetch cannot be reliably cancelled once the server has rotated the
  // token, so the response is allowed to finish but may no longer write.
  sessionGeneration += 1
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
  // The backoff belonged to the session that just ended. A sign-in after this
  // is a new session and must not inherit the old one's pause.
  resetRefreshBackoff()
  const s = storage()
  /*
   * THE HINT IS THE BROWSER'S, SO ONLY THE COOKIE'S END TAKES IT AWAY.
   *
   * A tab holding its own token (a Telegram launch, a sign-in from before the
   * move) that ends its session says nothing about the cookie every other tab
   * rides. Dropping the hint there left those tabs unable to renew a healthy
   * cookie session: ten minutes later they were signed out for nothing
   * (review, 2026-09-22).
   */
  if (!s?.getItem(REFRESH_KEY)) writeMarker(false)
  if (s) {
    s.removeItem(ACCESS_KEY)
    s.removeItem(REFRESH_KEY)
    s.removeItem(EXPIRES_KEY)
  }
  /*
   * THE PERSON IS SIGNED OUT, SO THE HEADER MUST SAY SO.
   *
   * This cleared the tokens and left userAtom set, so after a dead session the
   * header kept the avatar and showed neither Login nor Logout (Logout needs a
   * token), and every action failed with 401 -- the "authorization anomalies".
   * An event rather than an import: atoms/user.ts imports this module.
   */
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(APP_SESSION_CLEARED))
  }
}

/** After a transient failure, try again in this long, then twice as long. */
const RETRY_MS = 15_000
const RETRY_MAX_MS = 5 * 60_000
let retryMs = RETRY_MS

function scheduleRefresh(delayOverride?: number): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
  if (!hasRenewableAppSession()) return
  const expiresAt = Number(storage()?.getItem(EXPIRES_KEY) || 0)
  // A cookie session in a fresh tab has no stored expiry yet: renew now.
  const due =
    Number.isFinite(expiresAt) && expiresAt > 0
      ? expiresAt - Date.now() - REFRESH_EARLY_MS
      : 0
  const delay = Math.max(0, delayOverride ?? due)
  refreshTimer = setTimeout(() => {
    void refreshAppSession().then(
      () => {
        retryMs = RETRY_MS
      },
      (error: unknown) => {
        // A definitive refusal has already cleared the session inside
        // refreshAppSession. Anything else -- 429, 5xx, no network yet after
        // sleep -- says nothing about the session, so try again later rather
        // than throwing away a sign-in that is still good.
        if (error instanceof TransientSessionError) {
          scheduleRefresh(retryMs)
          retryMs = Math.min(RETRY_MAX_MS, retryMs * 2)
        }
      }
    )
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
  if (!hasRenewableAppSession()) return false
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
  if (cookieTransportAvailable() && logoutPending()) {
    // A sign-out that never reached the server: finish it, and do not renew.
    if (getAppAccessToken() && !storage()?.getItem(REFRESH_KEY)) {
      clearAppSession()
    }
    void finishPendingLogout()
  } else {
    // A tab reloaded after the cookie session ended elsewhere: it holds an
    // access token and no way to renew it. Signed out, and shown so.
    if (
      cookieTransportAvailable() &&
      getAppAccessToken() &&
      !storage()?.getItem(REFRESH_KEY) &&
      !readMarker()
    ) {
      clearAppSession()
    }
    scheduleRefresh()
    // A new tab, a bookmark, a restart: no access token here yet, but the jar
    // may hold a cookie session. Ask now, so the person appears as soon as
    // the token does -- and not a moment before it (see APP_SESSION_PERSON).
    if (!hasLiveAppSession() && hasCookieSession()) void ensureFreshSession()
  }
  if (!win) return () => {}
  const heal = () => {
    void ensureFreshSession()
  }
  const events = ['visibilitychange', 'focus', 'online']
  for (const event of events) win.addEventListener(event, heal)
  win.addEventListener('storage', followTheJar)
  return () => {
    for (const event of events) win.removeEventListener(event, heal)
    win.removeEventListener('storage', followTheJar)
  }
}

/*
 * ONE BROWSER, ONE SIGN-IN: EVERY TAB FOLLOWS THE COOKIE.
 *
 * The cookie is the browser's, but each tab kept its own idea of who is signed
 * in, so "Sign out" in one tab left the others showing the person with a dead
 * token, and a sign-in in one left the others asking to sign in (review,
 * 2026-09-22). The hint in localStorage changes in every tab at once, and the
 * `storage` event tells the others: the hint gone means the cookie session
 * ended, and a tab riding it signs out too; the hint back means a session is
 * in the jar, and a tab with none renews into it -- the person appears with
 * the token (APP_SESSION_PERSON), never before it.
 *
 * Decided from the state, not from the event's fields, so a `storage.clear()`
 * (key null) and a plain object in tests are read the same way.
 */
function followTheJar(event?: { key?: string | null }): void {
  const key = event?.key
  if (key !== undefined && key !== null && key !== COOKIE_MARKER_KEY) return
  if (!cookieTransportAvailable()) return
  const ownToken = !!storage()?.getItem(REFRESH_KEY)
  if (!readMarker()) {
    if (getAppAccessToken() && !ownToken) clearAppSession()
    return
  }
  if (!getAppAccessToken() && !ownToken) void ensureFreshSession()
}

/**
 * Not before this moment may a refresh go out again after a transient failure.
 *
 * One gate, here, because every path to the server comes through this
 * function: the timer, the heal listeners, apiFetch before and after a 401,
 * sessionRenewal. A gate on only one of them let the others spend three
 * refreshes per API call against the sign-in brake, ten a minute per person
 * and shared with every sign-in door.
 */
let retryNotBefore = 0

function resetRefreshBackoff(): void {
  retryNotBefore = 0
  retryMs = RETRY_MS
}

export async function refreshAppSession(): Promise<AppSession> {
  if (refreshInFlight) return refreshInFlight
  if (Date.now() < retryNotBefore) {
    throw new TransientSessionError('backing off after a transient failure')
  }
  const stored = storage()?.getItem(REFRESH_KEY) || ''
  const viaCookie = hasCookieSession()
  if (!stored && !viaCookie) {
    /*
     * A TAB HOLDING A TOKEN WITH NOTHING LEFT TO RENEW IT IS SIGNED OUT.
     *
     * The cookie session ended in another tab (it signed out, or its refresh
     * was refused) and took the browser's hint with it. This tab still held
     * the access token, so the header kept the person while every request
     * came back 401 -- after a reload too (review, 2026-09-22). Say so.
     */
    if (getAppAccessToken()) clearAppSession()
    throw new Error('browser session is not available')
  }
  if (viaCookie && !stored && logoutPending()) {
    // "Sign out" was pressed in this browser and has not reached the server
    // yet. Renewing now would keep alive the very family it is ending.
    clearAppSession()
    void finishPendingLogout()
    throw new Error('signed out in this browser')
  }
  const generation = sessionGeneration
  refreshInFlight = (async () => {
    const attempt = async (): Promise<{
      response: Response
      body: Partial<AppSession> & { error?: string; detail?: string }
    }> => {
      let response: Response
      try {
        response = await fetch(authUrl('/api/auth/refresh'), {
          method: 'POST',
          credentials: authCredentials(),
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          // A token still held from before the move goes in the body, so a
          // tab signed in yesterday keeps working; a cookie session sends none.
          body: JSON.stringify(stored ? { refresh_token: stored } : {}),
        })
      } catch {
        // No network yet (waking from sleep), or the connection dropped.
        throw new TransientSessionError('network')
      }
      const body = (await response
        .json()
        .catch(() => ({}))) as Partial<AppSession> & {
        error?: string
        detail?: string
      }
      return { response, body }
    }

    let { response, body } = await attempt()

    /*
     * TWO TABS, ONE FAMILY: THE LOSER RETRIES, IT DOES NOT SIGN OUT.
     *
     * Two tabs arm their timers from the same expiry and arrive milliseconds
     * apart; one rotates, the other hears 409. With the token in the cookie
     * there is one jar for the whole browser, so the winner's Set-Cookie is
     * already in it -- the loser asks once more and rides the new token.
     * With a token held in this tab (the path from before the move), re-read
     * storage as before: the winner may have written it there.
     */
    if (response.status === 409 && body.error === 'auth_refresh_raced') {
      await new Promise(done => setTimeout(done, 400))
      if (viaCookie && !stored) {
        ;({ response, body } = await attempt())
      } else {
        const fresh = storage()?.getItem(REFRESH_KEY) || ''
        if (fresh && fresh !== stored && generation === sessionGeneration) {
          const access = getAppAccessToken()
          const expiresAt = Number(storage()?.getItem(EXPIRES_KEY) || 0)
          if (access) {
            const session: AppSession = {
              access_token: access,
              refresh_token: fresh,
              expires_in: Math.max(
                1,
                Math.round((expiresAt - Date.now()) / 1000)
              ),
            }
            // Write, not just return: storeAppSession re-arms the timer, or
            // the losing tab would never refresh again.
            storeAppSession(session)
            return session
          }
        }
        /*
         * NO WINNER WROTE HERE, SO THIS TAB'S COPY IS SPENT.
         *
         * The tab that won holds the successor in its own storage -- a
         * duplicated tab copies sessionStorage, and neither can write into the
         * other. Presenting this copy again after the server's grace window is
         * reuse, which revokes the family and signs the winner out too
         * (review, 2026-09-22: the first version retried it as transient).
         * End this tab's session alone, as before; the other keeps its own.
         */
        if (generation === sessionGeneration) clearAppSession()
        throw new Error('this tab’s refresh token was rotated in another tab')
      }
    }

    if (response.ok && typeof body.access_token === 'string') {
      if (generation !== sessionGeneration) {
        throw new Error('browser session changed during refresh')
      }
      if (viaCookie && !stored && logoutPending()) {
        // Another tab signed out while this reply was on its way: do not
        // bring the session back to life in this one.
        clearAppSession()
        void finishPendingLogout()
        throw new Error('signed out in this browser')
      }
      const session: AppSession = {
        access_token: body.access_token,
        refresh_token:
          typeof body.refresh_token === 'string'
            ? body.refresh_token
            : undefined,
        refresh_transport: body.refresh_transport,
        expires_in: typeof body.expires_in === 'number' ? body.expires_in : 600,
      }
      storeAppSession(session)
      /*
       * The person arrives WITH the token, never before it. A new tab renewing
       * a cookie session holds no one; the render sends who this is beside the
       * access token (cookie transport only), and atoms/user.ts takes it. The
       * first version kept the person in localStorage so a new tab showed them
       * at once -- before any token -- and Header's guest sweep answered "a
       * person with no token" with a logout that revoked the whole family.
       */
      if (body.telegram_user && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(APP_SESSION_PERSON, { detail: body.telegram_user })
        )
      }
      return session
    }

    /*
     * ONLY THE SERVER SAYING "THIS TOKEN IS DONE" ENDS THE SESSION.
     *
     * 401 is that answer: unknown, revoked, expired, reused, family over 60
     * days -- log in again. Everything else is not: 429 is the brake (ten
     * attempts a minute per client, shared with every sign-in door), 5xx is
     * the render or Railway's edge during a deploy, 400 is an older render
     * that does not yet read the cookie. Clearing on those is how one bad
     * minute used to throw away a 60-day sign-in; now they are retried.
     */
    if (response.status === 401) {
      clearAppSession()
      throw new Error(body.detail || body.error || 'HTTP 401')
    }
    throw new TransientSessionError(
      body.detail || body.error || `HTTP ${response.status}`
    )
  })()
    .then(
      session => {
        // Any success, not only the timer's: a refresh apiFetch started must
        // also reset the backoff, or one bad minute inflates every later pause.
        retryNotBefore = 0
        retryMs = RETRY_MS
        return session
      },
      (error: unknown) => {
        if (error instanceof TransientSessionError) {
          retryNotBefore = Date.now() + retryMs
        }
        throw error
      }
    )
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

export async function logoutAppSession(): Promise<void> {
  const access = getAppAccessToken()
  const refresh = storage()?.getItem(REFRESH_KEY) || ''
  // Read before clearing: clearAppSession drops the marker.
  const viaCookie = hasCookieSession()
  // Local logout is synchronous and fail-closed. A stalled network request or
  // a tab close must not leave a reusable browser credential behind.
  clearAppSession()
  // "Sign out" signs this browser out: the server revokes the cookie's family
  // too (render /logout), so the hint goes even from a tab with its own token.
  if (viaCookie) writeMarker(false)
  if (!access && !refresh && !viaCookie) return
  if (viaCookie && !refresh) {
    // The server revokes the family and takes the HttpOnly cookie out of the
    // jar; only it can. Mark it pending first, so a request lost on the way
    // is finished by the next boot instead of leaving the credential behind.
    setLogoutPending(true)
    if (await sendCookieLogout(access)) setLogoutPending(false)
    return
  }
  try {
    await fetch(authUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: authCredentials(),
      headers: authHeaders({
        'Content-Type': 'application/json',
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      }),
      body: JSON.stringify(refresh ? { refresh_token: refresh } : {}),
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
  // Read before clearing: clearAppSession drops the hint.
  const viaCookie = hasCookieSession()
  clearAppSession()
  if (viaCookie) {
    writeMarker(false)
    // As logoutAppSession: until the server confirms, this browser's own
    // cookie is still live, and only a reply from the render can remove it.
    setLogoutPending(true)
  }
  if (!access) {
    if (viaCookie && (await sendCookieLogout(''))) setLogoutPending(false)
    return false
  }
  let ok = false
  try {
    const response = await fetch(authUrl('/api/auth/logout-all'), {
      method: 'POST',
      credentials: authCredentials(),
      headers: authHeaders({ Authorization: `Bearer ${access}` }),
    })
    ok = response.ok
  } catch {
    ok = false
  }
  /*
   * "Everywhere" failed -- an expired Bearer, the network -- but THIS browser
   * must still be signed out: its cookie's family is revoked by the plain
   * logout, which the cookie alone can prove (review, 2026-09-22: a failed
   * logout-all left the cookie and its family alive, with nothing pending).
   */
  if (viaCookie) {
    if (ok || (await sendCookieLogout(access))) setLogoutPending(false)
  }
  return ok
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
/** A sign-in reply that carries a session, however its refresh travelled. */
function isSessionReply(body: Partial<AppSession>): body is AppSession {
  return (
    typeof body.access_token === 'string' &&
    (typeof body.refresh_token === 'string' ||
      body.refresh_transport === 'cookie')
  )
}

export async function exchangeTelegramLaunch(
  initData: string
): Promise<AppSession | null> {
  if (!initData) return null
  try {
    // Never cookie transport on this door. initData is launch material the
    // person did not type: telegram-web-app.js reads it from `#tgWebAppData`
    // in any browser, so a link carrying someone else's launch would have
    // written THEIR session into this browser's jar for sixty days. The Mini
    // App signs in from initData on every launch, so it keeps the tab store.
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
      !isSessionReply(body) ||
      typeof body.expires_in !== 'number'
    ) {
      return null
    }
    const session = body
    storeAppSession(session, { signIn: true })
    return session
  } catch {
    // Сеть отвалилась — не повод трогать то, что уже работает.
    return null
  }
}

export async function exchangeTelegramWidget(
  payload: Record<string, unknown>
): Promise<AppSession> {
  let response: Response
  try {
    response = await fetch(authUrl('/api/auth/widget'), {
      method: 'POST',
      credentials: authCredentials(),
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    })
  } catch (error) {
    /*
     * THE COOKIE DOOR IS UNREACHABLE: SIGN IN THE WAY THAT ALWAYS WORKED.
     *
     * A fetch throws before any reply when auth.t27.ai does not answer, its
     * certificate is not there, or a render rolled back to a build without its
     * CORS refuses the preflight -- and in each case the request never reached
     * the door. Without this, nobody could sign in on the web until someone
     * noticed (review, 2026-09-22). The API host answers as it did before the
     * move: the refresh token comes back in the body and stays in this tab.
     */
    if (!cookieTransportAvailable()) throw error
    response = await fetch(`${API_BASE}/api/auth/widget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }
  const body = (await response
    .json()
    .catch(() => ({}))) as Partial<AppSession> & {
    error?: string
    detail?: string
  }
  if (!response.ok || !isSessionReply(body)) {
    throw new Error(body.detail || body.error || `HTTP ${response.status}`)
  }
  const session = body
  storeAppSession(session, { signIn: true })
  return session
}
