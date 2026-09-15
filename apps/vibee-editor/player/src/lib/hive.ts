/**
 * The game's address. One function, imported by the page and by the test, so
 * a moved page is changed in one place and the test tells us if it was not.
 *
 * The hash route is hers: t27.ai is a single-page site and `#/queen` is the
 * board. Do not "clean it up" to `/queen` -- GitHub Pages would answer 404.
 *
 * The language rides in `?lang=` before the hash, because that is where her
 * page reads it (gHashTag/trinity, `apps/website/src/i18n/context.tsx`), and
 * only these codes; any other she would ignore, so it is sent as her default.
 */
const QUEEN_LANGS = ['en', 'ru', 'de', 'zh', 'es']

export function queenPage(lang: string): string {
  const code = QUEEN_LANGS.includes(lang) ? lang : 'en'
  return `https://t27.ai/?lang=${code}#/queen`
}

/**
 * WHO THE VISITOR IS, FOR THE GAME FRAMED BY THIS TAB.
 *
 * The game asks with `{v:1, type:'tri-identity-request', nonce}`. The player
 * answers with a 300 s game token minted from its own credential, never with
 * that credential: /api/auth/game-token takes the credential and returns a
 * token that /mcp accepts only from https://t27.ai, only for identity tools.
 *
 * The same request and reply shapes as the bridge page for a top-level game
 * (public/bridge/bridge.js), minus `consent-required`: here the person is
 * inside their own app, so no click is asked.
 *
 * Credential, the same precedence as apiFetch's authHeaders: signed Telegram
 * initData when present, otherwise the browser session's Bearer. Never an
 * agent key, and no cookies. While the server's LAUNCH_BOT_IDS is unset it
 * refuses initData; that refusal reaches the game as `unavailable` with the
 * server's code (game_token_launch_bots_unset).
 */
export const GAME_ORIGIN = 'https://t27.ai'

type Reply<S extends string, Extra = unknown> = {
  v: 1
  type: 'tri-identity'
  nonce: string
  state: S
} & Extra

export type IdentityReply =
  | Reply<'signed-out'>
  | Reply<
      'signed-in',
      { game_token: string; expires_in: number; telegram_id: string }
    >
  | Reply<'unavailable', { code: string }>

export interface PlayerCredential {
  initData: string
  accessToken: string
}

/** The nonce of a well-formed identity request, or null for anything else. */
export function identityRequestNonce(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const request = data as { v?: unknown; type?: unknown; nonce?: unknown }
  if (request.v !== 1 || request.type !== 'tri-identity-request') return null
  const { nonce } = request
  if (typeof nonce !== 'string' || !nonce || nonce.length > 128) return null
  return nonce
}

export async function mintForGame(
  nonce: string,
  credential: PlayerCredential,
  apiBase: string,
  fetchImpl: typeof fetch = fetch
): Promise<IdentityReply> {
  const base = { v: 1, type: 'tri-identity', nonce } as const
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (credential.initData) {
    headers['X-Telegram-Init-Data'] = credential.initData
  } else if (credential.accessToken) {
    headers.Authorization = `Bearer ${credential.accessToken}`
  } else {
    return { ...base, state: 'signed-out' }
  }
  try {
    const response = await fetchImpl(`${apiBase}/api/auth/game-token`, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      headers,
      body: JSON.stringify({ aud: GAME_ORIGIN }),
    })
    const body = (await response.json().catch(() => ({}))) as {
      game_token?: unknown
      expires_in?: unknown
      telegram_id?: unknown
      error?: unknown
    }
    if (
      response.ok &&
      typeof body.game_token === 'string' &&
      typeof body.expires_in === 'number' &&
      typeof body.telegram_id === 'string'
    ) {
      return {
        ...base,
        state: 'signed-in',
        game_token: body.game_token,
        expires_in: body.expires_in,
        telegram_id: body.telegram_id,
      }
    }
    const code = !response.ok
      ? typeof body.error === 'string'
        ? body.error
        : `http_${response.status}`
      : 'bad_response'
    return { ...base, state: 'unavailable', code }
  } catch {
    return { ...base, state: 'unavailable', code: 'network' }
  }
}

/**
 * The game, signed out inside the Hive, asks the page to sign the visitor in
 * instead of navigating the whole app away: `{v:1, type:'t27-app',
 * kind:'sign-in'}`.
 */
export function isSignInRequest(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const message = data as { v?: unknown; type?: unknown; kind?: unknown }
  return (
    message.v === 1 && message.type === 't27-app' && message.kind === 'sign-in'
  )
}

/**
 * Answers identity requests from the game frame only: `event.source` must be
 * that frame's window and `event.origin` exactly https://t27.ai. The reply
 * goes back to the same window with targetOrigin https://t27.ai, and is
 * dropped if `frame()` no longer returns that window (the page replaced the
 * frame, or it has left the Queen). A sign-in request passing the same checks
 * calls `onSignIn`. Returns the unsubscribe.
 */
export function answerIdentityRequests(options: {
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>
  frame: () => Window | null | undefined
  credential: () => PlayerCredential
  apiBase: string
  fetchImpl?: typeof fetch
  onSignIn?: () => void
}): () => void {
  const { win, frame, credential, apiBase, fetchImpl, onSignIn } = options
  const onMessage = (event: MessageEvent) => {
    const target = frame()
    if (!target || event.source !== target) return
    if (event.origin !== GAME_ORIGIN) return
    if (isSignInRequest(event.data)) {
      onSignIn?.()
      return
    }
    const nonce = identityRequestNonce(event.data)
    if (nonce === null) return
    void mintForGame(nonce, credential(), apiBase, fetchImpl).then(reply => {
      if (frame() === target) target.postMessage(reply, GAME_ORIGIN)
    })
  }
  win.addEventListener('message', onMessage)
  return () => win.removeEventListener('message', onMessage)
}
