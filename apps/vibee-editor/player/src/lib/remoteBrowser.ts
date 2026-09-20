/**
 * THE PERSON'S OWN BROWSER, FROM THE MINI APP'S SIDE.
 *
 * One door on the server (`/api/browser/*`), one door here. Everything this
 * module knows about the browser is what the server chose to tell it: a
 * state, a session id and a path. It never learns where the pod is, and it
 * never holds the admin token -- see the server's `publicView` and the test
 * that searches the response for both.
 *
 * WHY "unavailable" AND "signin" ARE STATES AND NOT ERRORS. Railway runs the
 * broker but cannot run pods, so 503 there is by design; and a visitor who
 * has not signed in gets 401, which is the ordinary first visit. Measured by
 * opening the page in a plain browser: the screen showed the server's own
 * words, "no X-Api-Key and no Telegram initData". That is a sentence for
 * whoever wrote the server, not for the person holding the phone.
 */
import { API_BASE } from '../config'
import { apiFetch, type ApiError } from '@/lib/apiFetch'

export type BrowserState =
  | 'none'
  | 'starting'
  | 'live'
  | 'unavailable'
  | 'signin'

export interface BrowserSessionView {
  state: BrowserState
  sessionId?: string
  /** Path on the render server, e.g. `/live/<id>?t=<token>`. */
  viewUrl?: string
}

interface ServerAnswer {
  ok?: boolean
  state?: string
  sessionId?: string
  viewUrl?: string
}

const asView = (a: ServerAnswer): BrowserSessionView => ({
  state: (a.state as BrowserState) || 'none',
  sessionId: a.sessionId,
  viewUrl: a.viewUrl,
})

/**
 * The address the person actually opens.
 *
 * The server hands back a PATH, never a URL, because it must not publish
 * where the pod is. The origin is ours to add, and it is OUR OWN: `/live/` is
 * proxied under this app's origin by the nginx config that ships in the same
 * image as this bundle. Same origin means the viewer's cookie is first-party,
 * which is the only way a frame on a phone keeps it -- see `canEmbed`.
 *
 * A path is resolved against this app. An absolute URL, if the server ever
 * returns one, is left alone and `canEmbed` then refuses to frame it.
 */
export function absoluteViewUrl(viewUrl: string): string {
  return new URL(viewUrl, window.location.origin).toString()
}

/**
 * WHETHER THE BROWSER CAN BE SHOWN INSIDE THIS PAGE.
 *
 * The session cookie the proxy sets is `SameSite=Lax`, so it is not sent at
 * all from a cross-site frame -- the frame would load and then be refused,
 * which reads to the person as a browser that forgot them. Telegram on iOS is
 * WKWebView, which blocks third-party cookies outright, so `SameSite=None`
 * would not rescue it either.
 *
 * Since `/live/` is now proxied under this app's origin, this normally
 * answers true. It is kept, and kept honest, for the case it still catches:
 * a server that hands back an absolute URL somewhere else. That is never
 * framed -- it is opened top-level, where the cookie is first-party.
 */
export function canEmbed(viewUrl: string): boolean {
  try {
    return (
      new URL(absoluteViewUrl(viewUrl), window.location.href).origin ===
      window.location.origin
    )
  } catch {
    return false
  }
}

const statusOf = (e: unknown): number =>
  typeof e === 'object' && e && 'status' in e ? (e as ApiError).status : 0

/** Two refusals are ordinary states; everything else is a real failure. */
function stateOrThrow(e: unknown): BrowserSessionView {
  const status = statusOf(e)
  if (status === 503) return { state: 'unavailable' }
  if (status === 401) return { state: 'signin' }
  throw e
}

export async function readBrowserSession(): Promise<BrowserSessionView> {
  try {
    return asView(
      await apiFetch<ServerAnswer>(`${API_BASE}/api/browser/session`)
    )
  } catch (e) {
    return stateOrThrow(e)
  }
}

export async function openBrowserSession(): Promise<BrowserSessionView> {
  try {
    return asView(
      await apiFetch<ServerAnswer>(`${API_BASE}/api/browser/session`, {
        method: 'POST',
      })
    )
  } catch (e) {
    return stateOrThrow(e)
  }
}

/** Closes the browser and KEEPS the logins. The ordinary thing. */
export async function closeBrowserSession(): Promise<BrowserSessionView> {
  try {
    return asView(
      await apiFetch<ServerAnswer>(`${API_BASE}/api/browser/session`, {
        method: 'DELETE',
      })
    )
  } catch (e) {
    return stateOrThrow(e)
  }
}

/** Forget me: stops the browser AND wipes the profile. Irreversible. */
export async function forgetBrowserProfile(): Promise<BrowserSessionView> {
  try {
    return asView(
      await apiFetch<ServerAnswer>(`${API_BASE}/api/browser/profile`, {
        method: 'DELETE',
      })
    )
  } catch (e) {
    return stateOrThrow(e)
  }
}
