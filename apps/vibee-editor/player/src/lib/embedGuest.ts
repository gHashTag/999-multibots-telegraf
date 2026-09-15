import { APP_ORIGIN, IS_EMBED } from './embed'
import { getAppAccessToken } from './appSession'
import { GAME_ORIGIN, TRI_SCREEN_IDS } from './returnTarget'
import { getInitData } from './telegram'

/**
 * A GUEST IN THE GAME'S TRI FRAME.
 *
 * Framed by t27.ai the app holds no session (lib/framedSession.ts), and signing
 * in inside the frame is impossible (Telegram's widget refuses a t27.ai
 * ancestor). Measured on lang=en: profile showed a hard-coded Russian "open
 * the app inside Telegram", CRM four "Could not load: 401" blocks, chat and
 * script forms whose calls all failed. None offered a way to sign in.
 *
 * So the screens that need a person (chat, profile, CRM, the AI stages) show
 * one panel instead, linking the whole tab to the app's sign-in with ?return=
 * back to the same TRI screen (lib/returnTarget.ts). Guests get the panel for
 * CRM too, as the safe default. The feed stays open.
 *
 * A frame that does send a credential (the game under app.t27.ai/game/, or a
 * Mini App) opens the screen; if the server then refuses it with 401, the CRM
 * and agent clients mark the document and the panel takes over.
 */

export type TriScreenId = (typeof TRI_SCREEN_IDS)[number]

const AI_STAGE = /^\/generate\/(script|audio|image|avatar|video|editor)\/?$/

/** The TRI screen a route needs a person for, or null when a guest may use it. */
export function guestScreenOf(pathname: string): TriScreenId | null {
  if (/^\/chat\/?$/.test(pathname)) return 'chat'
  if (/^\/profile\/?$/.test(pathname)) return 'profile'
  if (/^\/crm(?:\/|$)/.test(pathname)) return 'crm'
  const stage = AI_STAGE.exec(pathname)
  return stage ? (stage[1] as TriScreenId) : null
}

/** The app's sign-in, returning to this TRI screen in the game. */
export function signInReturnHref(screen: TriScreenId): string {
  const back = `${GAME_ORIGIN}/#/queen?tab=tri&screen=${screen}`
  return `${APP_ORIGIN}/?return=${encodeURIComponent(back)}`
}

/** Whether calls from this document carry a credential (lib/apiFetch.ts). */
export function hasCredential(): boolean {
  return !!getInitData() || !!getAppAccessToken()
}

let signInNeeded = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(listener => listener())
}

/** The server refused this document's credential (401) inside the TRI frame. */
export function markEmbedSignInNeeded(): void {
  if (!IS_EMBED || signInNeeded) return
  signInNeeded = true
  notify()
}

export function embedSignInNeeded(): boolean {
  return signInNeeded
}

export function subscribeEmbedSignInNeeded(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** For tests: the next test starts without the mark. */
export function forgetEmbedSignInNeeded(): void {
  signInNeeded = false
  notify()
}
