import {
  getAppAccessToken,
  hasLiveAppSession,
  hasRenewableAppSession,
  refreshAppSession,
  TransientSessionError,
} from './appSession'
import { markEmbedSignInNeeded } from './embedGuest'

/**
 * AN EXPIRED ACCESS TOKEN IS RENEWED BEFORE IT IS SENT, NOT AFTER IT FAILS.
 *
 * Seen on app.t27.ai/queen, 2026-09-21: a signed-in person saved their profile
 * and was told "a Telegram signature or an agent key is required"; the club
 * paywall answered the same to "Join". The access token lives ten minutes
 * (apiFetch.ts), and the only thing that renewed it was a timer inside a page
 * that stayed open (appSession.ts scheduleRefresh). The board frames the app
 * and reloads that frame on every screen change, so the frame read a token that
 * had expired while it was not loaded, sent it, and the server -- for which a
 * Bearer DECIDES the outcome (render auth.ts) -- refused. Nothing retried.
 *
 * Twenty-three places call fetch with authHeaders() directly, so the fix lives
 * under all of them rather than in apiFetch alone: a request to our own server
 * that carries this tab's Bearer is sent with a live one. An expired token with
 * a refresh token is renewed first; a 401 on a Bearer that was live is renewed
 * once and sent again. A request that carries Telegram initData or no Bearer is
 * not touched, and neither is a Request object or a body that cannot be sent
 * twice.
 *
 * When renewal is impossible (the refresh token is gone or refused), the
 * session is over: the embedded screens show their sign-in panel instead of a
 * form that can only fail (embedGuest.ts).
 */

type Fetch = typeof fetch

const RESENDABLE = (body: unknown): boolean =>
  body === undefined ||
  body === null ||
  typeof body === 'string' ||
  body instanceof URLSearchParams ||
  (typeof FormData !== 'undefined' && body instanceof FormData) ||
  (typeof Blob !== 'undefined' && body instanceof Blob) ||
  body instanceof ArrayBuffer ||
  ArrayBuffer.isView(body)

/** The Bearer this request carries, when it is this tab's session. */
function bearerOf(init: RequestInit | undefined): string | null {
  if (!init?.headers) return null
  const value = new Headers(init.headers).get('Authorization') || ''
  if (!value.startsWith('Bearer ')) return null
  const token = value.slice(7).trim()
  // Only this tab's own session token is ours to renew; a caller that sends
  // some other Bearer (a game token, a third-party API) is left alone.
  return token && token === getAppAccessToken() ? token : null
}

function withBearer(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

/** What a renewal came to: a fresh token, a refusal, or a bad moment. */
type Renewal = { token: string } | { refused: true } | { transient: true }

async function renewed(): Promise<Renewal> {
  try {
    await refreshAppSession()
    const token = getAppAccessToken() // secret-guard-ok: reads this tab's session, holds no value
    return token ? { token } : { refused: true }
  } catch (error) {
    // refreshAppSession has already cleared a refused session. A transient
    // failure -- the brake, a deploy, no network yet -- kept it, and asking
    // the board to sign in again over it was a false alarm (review,
    // 2026-09-22): the session renews on the next try.
    if (error instanceof TransientSessionError) return { transient: true }
    markEmbedSignInNeeded()
    return { refused: true }
  }
}

/*
 * A BAD MOMENT IS NOT A SIGN-OUT, SO IT MUST NOT LOOK LIKE ONE.
 *
 * After a transient renewal failure the wrapper used to send the request with
 * the dead Bearer anyway; the server answered 401, and callers that read a 401
 * as "signed out" (crm.ts, agentStream.ts) put the board's sign-in panel over
 * the screen (second review, 2026-09-22). The request is answered here instead,
 * as the service being briefly unavailable, which is what happened.
 */
function renewalUnavailable(): Response {
  return new Response(
    JSON.stringify({
      error: 'session_renewal_unavailable',
      detail: 'the sign-in service did not answer; try again in a moment',
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  )
}

export function sessionRenewingFetch(
  base: Fetch,
  isOurServer: (url: string) => boolean
): Fetch {
  const wrapped = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : null
    const sent = url && isOurServer(url) ? bearerOf(init) : null
    if (!sent || !init) return base(input, init)

    let request = init
    if (!hasLiveAppSession() && hasRenewableAppSession()) {
      const first = await renewed()
      if ('transient' in first) return renewalUnavailable()
      if (!('token' in first)) return base(input, init)
      request = withBearer(init, first.token)
    }

    const response = await base(input, request)
    if (response.status !== 401 || !RESENDABLE(request.body)) return response
    if (!hasRenewableAppSession()) {
      markEmbedSignInNeeded()
      return response
    }
    const again = await renewed()
    if ('transient' in again) return renewalUnavailable()
    if (!('token' in again)) return response
    return base(input, withBearer(request, again.token))
  }
  return wrapped as Fetch
}

let installed = false

/** Wraps window.fetch once, before anything sends a request. */
export function installSessionRenewal(
  isOurServer: (url: string) => boolean
): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.fetch = sessionRenewingFetch(window.fetch.bind(window), isOurServer)
}
