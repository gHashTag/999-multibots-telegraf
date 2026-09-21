/**
 * THE RENDER'S CLUB ROUTES, AS A DOUBLE THAT REFUSES WHAT THE RENDER REFUSES.
 *
 * Only the three club paths exist, each with its one method; the server key
 * must be the one configured; the person must be named in `?telegram_id=`.
 * Anything else throws or answers 401 the way render/src/agent/club-membership.ts
 * does -- so a bot that calls a path the render does not serve, forgets the
 * key, or forgets whose club it is asking about, fails here instead of in
 * production. The bodies are the render's own shapes (clubStatus, the invoice
 * route, the verify route).
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
  const calls: Array<{ route: string; who: string }> = []
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
    const headers = (init.headers ?? {}) as Record<string, string>
    if (headers['X-Api-Key'] !== script.key) {
      return json(401, {
        ok: false,
        error: 'нужна подпись, сессия приложения или ключ агента',
      })
    }
    const who = u.searchParams.get('telegram_id')
    if (!who || !/^\d{5,15}$/.test(who)) {
      return json(401, { ok: false, error: 'no person named' })
    }
    calls.push({ route, who })
    if (script.down?.includes(route)) throw new Error('ECONNRESET')
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
