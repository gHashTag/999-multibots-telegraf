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
import { isWelcomeStep } from '../../../packages/vibee-atoms/src/welcome-steps'
import { AGENT_PACKAGES } from '../../../packages/vibee-atoms/src/agent-packages'
import { MARKETPLACE_AGENTS } from '../../../packages/vibee-atoms/src/agent-marketplace'

export interface Queryable {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

export const TRAFFIC_PATHS = [
  '/api/traffic/arrival',
  /*
   * A /start of one of our bots from a tagged link (utm.ts taggedBotLink).
   * Sent by the bot process with the service key, never by a page: the
   * guard keeps it closed (auth.ts), and the handler asks for the key again.
   */
  '/api/traffic/start',
  /*
   * A step on the welcome screen (vibee-atoms welcome-steps.ts): the
   * screen's heatmap. Public like an arrival, bounded the same way.
   */
  '/api/traffic/welcome',
] as const

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
let startsReady = false
let welcomeReady = false
export function resetTrafficTableForTests(): void {
  tableReady = false
  startsReady = false
  welcomeReady = false
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

async function ensureStartsTable(q: Queryable): Promise<void> {
  if (startsReady) return
  await q.query(`CREATE TABLE IF NOT EXISTS traffic_starts (
    day date NOT NULL DEFAULT current_date,
    source text NOT NULL,
    campaign text NOT NULL DEFAULT '',
    n integer NOT NULL DEFAULT 1,
    PRIMARY KEY (day, source, campaign)
  )`)
  startsReady = true
}

/**
 * A bot start from a tagged link: the channel, and what the link opened
 * (`app_feed`, `club` -> the campaign). No person: the bot sends no id.
 */
export interface BotStart {
  source: string
  campaign: string
}

/** A start from untrusted JSON, or null when it names no source. Pure. */
export function botStartOf(raw: unknown): BotStart | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const source = tagValue(r.source)
  if (!source) return null
  return { source, campaign: tagValue(r.campaign) }
}

export async function countStart(q: Queryable, s: BotStart): Promise<void> {
  await ensureStartsTable(q)
  await q.query(
    `INSERT INTO traffic_starts (source, campaign) VALUES ($1, $2)
     ON CONFLICT (day, source, campaign)
     DO UPDATE SET n = traffic_starts.n + 1`,
    [s.source, s.campaign]
  )
}

/** Bot starts by source over the last `days` days. */
export async function startsBySource(
  q: Queryable,
  days: number
): Promise<Map<string, number>> {
  await ensureStartsTable(q)
  const { rows } = await q.query(
    `SELECT source, SUM(n)::int AS starts
       FROM traffic_starts
      WHERE day > current_date - $1::int
      GROUP BY source`,
    [clampDays(days)]
  )
  return new Map(rows.map(r => [String(r.source), Number(r.starts) || 0]))
}

/** 1..365, 30 when not a number. Pure. */
export function clampDays(days: number): number {
  return Math.min(Math.max(1, Math.floor(days) || 30), 365)
}

export interface SourceCount {
  source: string
  arrivals: number
  starts: number
}

/**
 * Per source: visits on our pages and starts of our bots, most first. A
 * source with starts and no visits is real (a link straight into the bot).
 * Pure.
 */
export function bySource(
  channels: readonly ChannelCount[],
  starts: ReadonlyMap<string, number>
): SourceCount[] {
  const m = new Map<string, SourceCount>()
  for (const c of channels) {
    const x = m.get(c.source) ?? { source: c.source, arrivals: 0, starts: 0 }
    x.arrivals += c.arrivals
    m.set(c.source, x)
  }
  for (const [source, n] of starts) {
    const x = m.get(source) ?? { source, arrivals: 0, starts: 0 }
    x.starts += n
    m.set(source, x)
  }
  return [...m.values()].sort(
    (a, b) =>
      b.arrivals + b.starts - (a.arrivals + a.starts) ||
      a.source.localeCompare(b.source)
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
  const d = clampDays(days)
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

/**
 * A STEP ON THE WELCOME SCREEN: (day, step, item) -> count.
 *
 * The step is one of WELCOME_STEPS; the item is a package or an agent id,
 * kept only when it names one of ours -- anything else is stored as ''. So
 * the table can never grow past steps x (packages + agents) rows a day,
 * however the public endpoint is fed.
 */
export interface WelcomeHit {
  step: string
  item: string
}

const WELCOME_ITEMS = new Set<string>([
  ...AGENT_PACKAGES.map(p => p.id),
  ...MARKETPLACE_AGENTS.map(a => a.id),
])

/** A welcome step from untrusted JSON, or null when it is not on the list. Pure. */
export function welcomeHitOf(raw: unknown): WelcomeHit | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isWelcomeStep(r.step)) return null
  const item = tagValue(r.item)
  return { step: r.step, item: WELCOME_ITEMS.has(item) ? item : '' }
}

async function ensureWelcomeTable(q: Queryable): Promise<void> {
  if (welcomeReady) return
  await q.query(`CREATE TABLE IF NOT EXISTS traffic_welcome (
    day date NOT NULL DEFAULT current_date,
    step text NOT NULL,
    item text NOT NULL DEFAULT '',
    n integer NOT NULL DEFAULT 1,
    PRIMARY KEY (day, step, item)
  )`)
  welcomeReady = true
}

export async function countWelcome(q: Queryable, h: WelcomeHit): Promise<void> {
  await ensureWelcomeTable(q)
  await q.query(
    `INSERT INTO traffic_welcome (step, item) VALUES ($1, $2)
     ON CONFLICT (day, step, item)
     DO UPDATE SET n = traffic_welcome.n + 1`,
    [h.step, h.item]
  )
}

export interface WelcomeCount {
  step: string
  item: string
  n: number
}

/** Welcome steps over the last `days` days, most first. */
export async function welcomeSteps(
  q: Queryable,
  days: number
): Promise<WelcomeCount[]> {
  await ensureWelcomeTable(q)
  const { rows } = await q.query(
    `SELECT step, item, SUM(n)::int AS n
       FROM traffic_welcome
      WHERE day > current_date - $1::int
      GROUP BY step, item
      ORDER BY n DESC, step, item`,
    [clampDays(days)]
  )
  return rows.map(r => ({
    step: String(r.step),
    item: String(r.item ?? ''),
    n: Number(r.n) || 0,
  }))
}

/**
 * The welcome funnel: shown -> reached the packages -> pressed a way in
 * (a try, the gift, an order). Each share is of `shown`; with no shows
 * every share is 0, never a division by zero. Pure.
 */
export function welcomeFunnel(counts: readonly WelcomeCount[]): {
  shown: number
  packagesSeen: number
  tried: number
  ordered: number
  skipped: number
  reachedPackages: number
  orderRate: number
} {
  const sum = (...steps: string[]) =>
    counts.filter(c => steps.includes(c.step)).reduce((n, c) => n + c.n, 0)
  const shown = sum('shown')
  const packagesSeen = sum('packages_seen')
  const tried = sum('agent_talk', 'gift', 'package_try', 'pinned_gift')
  const ordered = sum('package_order', 'pinned_order')
  const share = (n: number) => (shown ? Math.round((n / shown) * 1000) / 10 : 0)
  return {
    shown,
    packagesSeen,
    tried,
    ordered,
    skipped: sum('skip'),
    reachedPackages: share(packagesSeen),
    orderRate: share(ordered),
  }
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
  /** The caller presented the service key (X-Api-Key): the bot process. */
  serviceKey?: boolean
}

export async function handleTraffic(
  req: { url?: string; method?: string },
  deps: TrafficDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  const path = (req.url || '').split('?')[0]
  if (!isTrafficPath(path)) return { status: 404, body: { ok: false } }
  if ((req.method || 'GET') !== 'POST')
    return { status: 405, body: { ok: false, error: 'POST only' } }
  if (path === '/api/traffic/start') return handleStart(deps)
  if (!allowArrival(deps.address, (deps.now ?? Date.now)()))
    return { status: 429, body: { ok: false, error: 'slow down' } }
  if (path === '/api/traffic/welcome') return handleWelcome(deps)
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

/** A step on the welcome screen; already past the per-address limit. */
async function handleWelcome(
  deps: TrafficDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await deps.readBody())
  } catch {
    return { status: 400, body: { ok: false, error: 'JSON body expected' } }
  }
  const h = welcomeHitOf(parsed)
  if (!h) return { status: 400, body: { ok: false, error: 'unknown step' } }
  try {
    await countWelcome(await deps.getPool(), h)
    return { status: 200, body: { ok: true } }
  } catch {
    return { status: 503, body: { ok: false, error: 'unavailable' } }
  }
}

/** A bot start, from the bot process only (the service key). */
async function handleStart(
  deps: TrafficDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!deps.serviceKey)
    return { status: 403, body: { ok: false, error: 'service key only' } }
  let parsed: unknown
  try {
    parsed = JSON.parse(await deps.readBody())
  } catch {
    return { status: 400, body: { ok: false, error: 'JSON body expected' } }
  }
  const s = botStartOf(parsed)
  if (!s) return { status: 400, body: { ok: false, error: 'no source' } }
  try {
    await countStart(await deps.getPool(), s)
    return { status: 200, body: { ok: true } }
  } catch {
    return { status: 503, body: { ok: false, error: 'unavailable' } }
  }
}

export const TRAFFIC_TOOLS: AgentTool[] = [
  {
    name: 'crm_traffic',
    description:
      'Where visitors come from: per channel (x, linkedin, reddit, threads, ' +
      'telegram...) the visits on our pages and the starts of our bots over ' +
      'the last N days, and the welcome screen heatmap (how many saw it, ' +
      'reached the packages, tried, ordered; every button by count). Owner only.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '1-365, default 30' },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, unknown>, ctx?: ToolContext) {
      requireOwner(ctx)
      const days = clampDays(Number(args?.days) || 30)
      const q = ctx!.pool as unknown as Queryable
      const channels = await arrivalsByChannel(q, days)
      const starts = await startsBySource(q, days)
      const sources = bySource(channels, starts)
      const welcome = await welcomeSteps(q, days)
      return {
        days,
        total: channels.reduce((n, c) => n + c.arrivals, 0),
        totalStarts: sources.reduce((n, c) => n + c.starts, 0),
        sources,
        channels,
        welcome: { funnel: welcomeFunnel(welcome), steps: welcome },
        note:
          'arrivals: visits on our pages (the app, t27.ai) from links tagged ' +
          'utm_source; starts: our bots opened from a link carrying the ' +
          'channel after "__" in /start; welcome: each step of the welcome ' +
          'screen counted once per visit (reachedPackages and orderRate are ' +
          '% of shown). Counts only -- no person behind a number is known.',
      }
    },
  },
]
