/**
 * WHERE THE TRAFFIC COMES FROM (epic #2974).
 *
 * The links carry their channel (utm.ts); this is the other half -- a page
 * we own counts the arrival. The app sends the tags once per visit to
 * POST /api/traffic/arrival, and the owner reads the counts by channel
 * (`crm_traffic`, `tri traffic`).
 *
 * NOTHING PERSONAL IS KEPT. A row is (day, source, medium, campaign,
 * content) -> count. No IP, no user id, no page text; the address that
 * sent it is used only for the in-memory rate limit and never stored.
 *
 * A PUBLIC COUNTER CAN BE STUFFED, so it is bounded: values are cleaned to
 * short lowercase tokens (utm.ts tagValue), and one address may count at
 * most ARRIVALS_PER_MINUTE times a minute. The numbers are a compass, not a
 * ledger: nothing is paid or decided per arrival.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireOwner } from './telegram-tools'
import { tagValue } from './utm'

export interface Queryable {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

export const TRAFFIC_PATHS = ['/api/traffic/arrival'] as const

export function isTrafficPath(path: string): boolean {
  return (TRAFFIC_PATHS as readonly string[]).includes(path)
}

export interface Arrival {
  source: string
  medium: string
  campaign: string
  content: string
}

/** An arrival from untrusted JSON, or null when it names no source. Pure. */
export function arrivalOf(raw: unknown): Arrival | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const source = tagValue(r.source)
  if (!source) return null
  return {
    source,
    medium: tagValue(r.medium),
    campaign: tagValue(r.campaign),
    content: tagValue(r.content),
  }
}

let tableReady = false
export function resetTrafficTableForTests(): void {
  tableReady = false
  hits.clear()
}

async function ensureTable(q: Queryable): Promise<void> {
  if (tableReady) return
  await q.query(`CREATE TABLE IF NOT EXISTS traffic_arrivals (
    day date NOT NULL DEFAULT current_date,
    source text NOT NULL,
    medium text NOT NULL DEFAULT '',
    campaign text NOT NULL DEFAULT '',
    content text NOT NULL DEFAULT '',
    n integer NOT NULL DEFAULT 1,
    PRIMARY KEY (day, source, medium, campaign, content)
  )`)
  tableReady = true
}

export async function countArrival(q: Queryable, a: Arrival): Promise<void> {
  await ensureTable(q)
  await q.query(
    `INSERT INTO traffic_arrivals (source, medium, campaign, content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (day, source, medium, campaign, content)
     DO UPDATE SET n = traffic_arrivals.n + 1`,
    [a.source, a.medium, a.campaign, a.content]
  )
}

export interface ChannelCount {
  source: string
  medium: string
  campaign: string
  arrivals: number
}

/** Arrivals by channel over the last `days` days, most first. */
export async function arrivalsByChannel(
  q: Queryable,
  days: number
): Promise<ChannelCount[]> {
  await ensureTable(q)
  const d = Math.min(Math.max(1, Math.floor(days) || 30), 365)
  const { rows } = await q.query(
    `SELECT source, medium, campaign, SUM(n)::int AS arrivals
       FROM traffic_arrivals
      WHERE day > current_date - $1::int
      GROUP BY source, medium, campaign
      ORDER BY arrivals DESC, source`,
    [d]
  )
  return rows.map(r => ({
    source: String(r.source),
    medium: String(r.medium ?? ''),
    campaign: String(r.campaign ?? ''),
    arrivals: Number(r.arrivals) || 0,
  }))
}

/** How many arrivals one address may count in a minute. */
export const ARRIVALS_PER_MINUTE = 20
const hits = new Map<string, { minute: number; n: number }>()

/** May this address count one more? In memory only, never stored. */
export function allowArrival(address: string, nowMs: number): boolean {
  const minute = Math.floor(nowMs / 60_000)
  const key = address || 'unknown'
  const h = hits.get(key)
  if (!h || h.minute !== minute) {
    if (hits.size > 10_000) hits.clear()
    hits.set(key, { minute, n: 1 })
    return true
  }
  h.n += 1
  return h.n <= ARRIVALS_PER_MINUTE
}

export interface TrafficDeps {
  getPool: () => Promise<Queryable>
  readBody: () => Promise<string>
  address: string
  now?: () => number
}

export async function handleTraffic(
  req: { url?: string; method?: string },
  deps: TrafficDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  const path = (req.url || '').split('?')[0]
  if (!isTrafficPath(path)) return { status: 404, body: { ok: false } }
  if ((req.method || 'GET') !== 'POST')
    return { status: 405, body: { ok: false, error: 'POST only' } }
  if (!allowArrival(deps.address, (deps.now ?? Date.now)()))
    return { status: 429, body: { ok: false, error: 'slow down' } }
  let parsed: unknown
  try {
    parsed = JSON.parse(await deps.readBody())
  } catch {
    return { status: 400, body: { ok: false, error: 'JSON body expected' } }
  }
  const a = arrivalOf(parsed)
  if (!a) return { status: 400, body: { ok: false, error: 'no source' } }
  try {
    await countArrival(await deps.getPool(), a)
    return { status: 200, body: { ok: true } }
  } catch {
    return { status: 503, body: { ok: false, error: 'unavailable' } }
  }
}

export const TRAFFIC_TOOLS: AgentTool[] = [
  {
    name: 'crm_traffic',
    description:
      'Where visitors come from: arrivals by channel (utm_source x, linkedin, reddit, ' +
      'threads, telegram...) over the last N days. Owner only.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '1-365, default 30' },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, unknown>, ctx?: ToolContext) {
      requireOwner(ctx)
      const days = Number(args?.days) || 30
      const channels = await arrivalsByChannel(
        ctx!.pool as unknown as Queryable,
        days
      )
      return {
        days,
        total: channels.reduce((n, c) => n + c.arrivals, 0),
        channels,
        note:
          'Counted where the page is ours (the app); links carry the channel ' +
          'in utm_source. Counts only -- no person behind a number is known.',
      }
    },
  },
]
