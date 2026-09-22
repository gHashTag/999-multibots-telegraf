import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AN EXPIRED ACCESS TOKEN IS RENEWED BEFORE IT IS SENT, NOT AFTER IT FAILS.
 *
 * app.t27.ai/queen, 2026-09-21: the board's frame read a ten-minute token that
 * had expired while no page was open to renew it, sent it, and profile save and
 * the club's "Join" were both refused with 401. These cases drive the wrapper
 * with a fake server and the real session store.
 */

const store = new Map<string, string>()
vi.mock('./framedSession', () => ({
  sessionStore: () => ({
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }),
}))
vi.mock('../config', () => ({ API_BASE: 'https://api.test' }))
vi.mock('./telegram', () => ({
  isTelegram: () => false,
  getInitData: () => '',
}))
const markEmbedSignInNeeded = vi.fn()
vi.mock('./embedGuest', () => ({
  markEmbedSignInNeeded: () => markEmbedSignInNeeded(),
}))

const { sessionRenewingFetch } = await import('./sessionRenewal')
const { getAppAccessToken } = await import('./appSession')

const ours = (url: string) => url.startsWith('https://api.test')

function signIn(access: string, expiresInMs: number, refresh = 'r1') {
  store.set('trinity.app.session.access', access)
  store.set('trinity.app.session.refresh', refresh)
  store.set('trinity.app.session.expires-at', String(Date.now() + expiresInMs))
}

/** A server that accepts only the tokens in `live`, and hands out `next` on refresh. */
function server(live: Set<string>, next: string[]) {
  const calls: Array<{ url: string; auth: string | null }> = []
  const base = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const auth = new Headers(init?.headers).get('Authorization')
    calls.push({ url, auth })
    if (url.endsWith('/api/auth/refresh')) {
      const token = next.shift()
      if (!token)
        return new Response('{"error":"refresh refused"}', { status: 401 })
      live.add(token)
      return new Response(
        JSON.stringify({
          access_token: token,
          refresh_token: `r-${token}`,
          expires_in: 600,
        }),
        { status: 200 }
      )
    }
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : ''
    return new Response('{}', { status: live.has(token) ? 200 : 401 })
  })
  return { base, calls }
}

const bearer = () => ({ Authorization: `Bearer ${getAppAccessToken()}` })

beforeEach(() => {
  store.clear()
  markEmbedSignInNeeded.mockClear()
})

describe('sessionRenewingFetch', () => {
  it('renews an expired token BEFORE the request, and sends the fresh one', async () => {
    signIn('old', -1000)
    const { base, calls } = server(new Set(), ['new'])
    globalThis.fetch = base as typeof fetch
    const f = sessionRenewingFetch(base as typeof fetch, ours)
    const r = await f('https://api.test/api/club/invoice', {
      method: 'POST',
      headers: bearer(),
      body: '{}',
    })
    expect(r.status).toBe(200)
    expect(calls.map(c => c.url)).toEqual([
      'https://api.test/api/auth/refresh',
      'https://api.test/api/club/invoice',
    ])
    expect(calls[1].auth).toBe('Bearer new')
  })

  it('retries once with a renewed token when a clock-live token is refused', async () => {
    signIn('revoked', 300_000)
    const { base, calls } = server(new Set(), ['new'])
    globalThis.fetch = base as typeof fetch
    const f = sessionRenewingFetch(base as typeof fetch, ours)
    const r = await f('https://api.test/mcp', {
      method: 'POST',
      headers: bearer(),
      body: '{"x":1}',
    })
    expect(r.status).toBe(200)
    expect(calls.map(c => c.auth)).toEqual([
      'Bearer revoked',
      null,
      'Bearer new',
    ])
  })

  it('a session that cannot be renewed ends: the frame is told to ask for a sign-in', async () => {
    signIn('old', -1000)
    const { base } = server(new Set(), [])
    globalThis.fetch = base as typeof fetch
    const f = sessionRenewingFetch(base as typeof fetch, ours)
    const r = await f('https://api.test/mcp', {
      method: 'POST',
      headers: bearer(),
      body: '{}',
    })
    expect(r.status).toBe(401)
    expect(markEmbedSignInNeeded).toHaveBeenCalled()
    expect(getAppAccessToken()).toBe('')
  })

  it("leaves alone requests without this tab's Bearer, to other servers, and live tokens that work", async () => {
    signIn('good', 300_000)
    const { base, calls } = server(new Set(['good']), ['never'])
    globalThis.fetch = base as typeof fetch
    const f = sessionRenewingFetch(base as typeof fetch, ours)
    await f('https://api.test/api/club/status', {
      headers: { 'X-Telegram-Init-Data': 'q' },
    })
    await f('https://elsewhere.test/x', {
      headers: { Authorization: 'Bearer good' },
    })
    await f('https://api.test/api/club/status', {
      headers: { Authorization: 'Bearer someone-else' },
    })
    const ok = await f('https://api.test/api/club/status', {
      headers: bearer(),
    })
    expect(ok.status).toBe(200)
    expect(calls.some(c => c.url.endsWith('/api/auth/refresh'))).toBe(false)
  })

  it('a renewal that fails for a bad moment answers 503 and does not send the dead token', async () => {
    // The board's CRM and chat read a 401 as "signed out" and show the sign-in
    // panel; after a transient failure the wrapper used to send the expired
    // Bearer anyway and hand them exactly that 401 (review, 2026-09-22).
    signIn('old', -1000)
    const calls: string[] = []
    const base = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(
        `${String(input)} ${new Headers(init?.headers).get('Authorization') ?? ''}`
      )
      if (String(input).endsWith('/api/auth/refresh'))
        return new Response('{"error":"deploy"}', { status: 503 })
      return new Response('{}', { status: 401 })
    })
    globalThis.fetch = base as typeof fetch
    const f = sessionRenewingFetch(base as typeof fetch, ours)
    const r = await f('https://api.test/api/crm/tool', {
      method: 'POST',
      headers: bearer(),
      body: '{}',
    })
    expect(r.status).toBe(503)
    expect(calls.some(c => c.includes('/api/crm/tool'))).toBe(false)
    expect(markEmbedSignInNeeded).not.toHaveBeenCalled()
  })
})
