import type { IncomingMessage } from 'node:http'
import { clubIdentity } from '../../../apps/vibee-editor/render/src/agent/club-identity'

/**
 * THE RENDER'S CLUB ROUTES, AS A DOUBLE THAT REFUSES WHAT THE RENDER REFUSES.
 *
 * Only the three club paths exist, each with its one method. WHOSE club a
 * request is about is not decided here: the double asks the render's own
 * `clubIdentity` -- the function render-server.ts hands to handleClub -- with
 * the request as Node would deliver it, under the render's key (`script.key`).
 * An earlier version checked the key and `?telegram_id=` by itself and so
 * accepted a request the real render refused: every bot test stayed green
 * while the club route was closed in production (2026-09-22). Now a bot that
 * forgets the key, sends it under another name, or forgets whose club it is
 * asking about gets what the render gives it: 401 on invoice and verify, and
 * the anonymous price -- "not a member" -- on status.
 *
 * The bodies are the render's own shapes (clubStatus, the invoice route, the
 * verify route); contract-tested against the real handleClub in
 * theBotsClubRequestReachesTheRender.test.ts.
 */
export const RENDER_ORIGIN = 'https://vibee-render-production.up.railway.app'

export interface ClubRenderScript {
  key: string
  status?: Record<string, unknown>
  invoice?: Record<string, unknown>
  verify?: Record<string, unknown>
  /** Routes ("POST /api/club/invoice") that fail at the network level. */
  down?: string[]
}

export const STRANGER_STATUS = {
  active: false,
  granted: null,
  until: null,
  paid_at: null,
  days_left: 0,
  periods: 0,
  stars: 10000,
  period_days: 30,
  tokens_per_period: 2571,
}

export function clubRender(script: ClubRenderScript) {
  const calls: Array<{ route: string; who: string | null }> = []
  const json = (status: number, body: unknown) =>
    ({
      status,
      ok: status < 400,
      json: async () => body,
    }) as unknown as Response

  const fetchImpl = async (url: unknown, init: RequestInit = {}) => {
    const u = new URL(String(url))
    if (u.origin !== RENDER_ORIGIN) {
      throw new Error(`no such host in this test: ${u.origin}`)
    }
    const method = (init.method ?? 'GET').toUpperCase()
    const route = `${method} ${u.pathname}`
    const who = asTheRender(script.key, {
      url: u.pathname + u.search,
      method,
      // Lower-cased names, the way Node hands headers to a handler.
      headers: Object.fromEntries(new Headers(init.headers ?? {}).entries()),
    })
    calls.push({ route, who })
    if (script.down?.includes(route)) throw new Error('ECONNRESET')
    if (!who) {
      // What handleClub answers when identity() is null.
      if (route === 'GET /api/club/status') {
        return json(200, { ok: true, anonymous: true, ...STRANGER_STATUS })
      }
      return json(401, {
        ok: false,
        error: 'нужна подпись, сессия приложения или ключ агента', // cyrillic-ok: the render's error text
      })
    }
    switch (route) {
      case 'GET /api/club/status':
        return json(200, { ok: true, ...(script.status ?? STRANGER_STATUS) })
      case 'POST /api/club/invoice':
        if (!script.invoice) throw new Error('invoice not scripted')
        return json(200, script.invoice)
      case 'POST /api/club/verify':
        if (!script.verify) throw new Error('verify not scripted')
        return json(200, script.verify)
      default:
        throw new Error(`the render serves no ${route}`)
    }
  }
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

/**
 * Run the render's identity decision with the render's key in the environment
 * (auth.ts reads RENDER_API_KEY on every call), then put the environment back.
 * Synchronous on purpose: nothing else can run while the key is swapped.
 */
function asTheRender(
  key: string,
  req: { url: string; method: string; headers: Record<string, string> }
): string | null {
  const saved = process.env.RENDER_API_KEY
  process.env.RENDER_API_KEY = key
  try {
    return clubIdentity(req as unknown as IncomingMessage)
  } finally {
    if (saved === undefined) delete process.env.RENDER_API_KEY
    else process.env.RENDER_API_KEY = saved
  }
}
