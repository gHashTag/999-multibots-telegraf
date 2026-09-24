import { logger } from '@/utils/logger'

/**
 * A START OF THE BOT FROM A TAGGED LINK IS COUNTED BY CHANNEL (tick 9).
 *
 * The render counts visits on our pages; a bot has no page, so the bot
 * process tells the render itself: POST /api/traffic/start with the service
 * key, `{ source, campaign }` and nothing else -- no telegram id, no name.
 * The owner reads it next to the visits (`crm_traffic`, the CRM screen,
 * `tri traffic`).
 *
 * NEVER THROWS, NEVER HOLDS THE GREETING. The count is a compass, not a
 * ledger: a render that is down costs one number, not a /start.
 */
const BASE =
  process.env.RENDER_BASE_URL ||
  'https://vibee-render-production.up.railway.app'
const TIMEOUT_MS = 5_000

export async function reportBotStart(
  start: { source: string; campaign: string },
  fetchImpl: typeof fetch = fetch
): Promise<'counted' | 'not counted'> {
  const key = process.env.RENDER_API_KEY || ''
  if (!key || !start.source) return 'not counted'
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(`${BASE}/api/traffic/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
      body: JSON.stringify({ source: start.source, campaign: start.campaign }),
      signal: ac.signal,
    })
    if (!res.ok) {
      logger.warn('[traffic] bot start refused', {
        status: res.status,
        source: start.source,
      })
      return 'not counted'
    }
    return 'counted'
  } catch (e) {
    logger.warn('[traffic] bot start not sent', {
      error: e instanceof Error ? e.message : String(e),
      source: start.source,
    })
    return 'not counted'
  } finally {
    clearTimeout(timer)
  }
}
