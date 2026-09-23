/**
 * A STRATEGY IS DATA, NOT CODE -- SO CHANGING ONE COSTS A SECOND.
 *
 * Owner, 2026-09-23: "how do we update strategies without redeploying the
 * repository? setting things up will take forever this way." He is right:
 * a pull request through the gates is fifteen minutes, a Railway variable is
 * a restart, and neither is the speed at which somebody tunes what their
 * agent does. Anything we may want to change while watching the agent work
 * -- which sites a round walks, how often, how long a page is given -- lives
 * in one row of the database and is read at the START of every tick. A
 * change takes effect on the next round: no build, no restart, nothing lost.
 *
 * The code keeps the DEFAULT. A row is an override, never a requirement, and
 * a row that makes no sense is ignored with a line in the log rather than
 * taking the round down: the person's accounts must keep being walked even
 * when somebody saves nonsense.
 *
 * Deliberately narrow: no scripts, no selectors, no URLs the agent then
 * treats as trusted instructions. A strategy says WHERE to look and HOW
 * OFTEN; what to do there is code, reviewed like code.
 */
import type { Queryable } from '../browser/sessions'

export interface Site {
  name: string
  url: string
}

export interface RoundStrategy {
  sites: Site[]
  everyMin: number
  settleMs: number
}

/** Bounds, so a saved row cannot make the agent a nuisance. */
export const MAX_SITES = 12
export const MIN_EVERY_MIN = 30
export const MAX_EVERY_MIN = 24 * 60
export const MIN_SETTLE_MS = 1_000
export const MAX_SETTLE_MS = 30_000

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(n)))

/** One site, or null when it is not one. Pure. */
export function siteOf(raw: unknown): Site | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { name?: unknown; url?: unknown }
  const url = typeof r.url === 'string' ? r.url.trim() : ''
  if (!/^https:\/\/[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)) return null
  const name =
    typeof r.name === 'string' && r.name.trim()
      ? r.name.trim().slice(0, 40)
      : new URL(url).host.replace(/^www\./, '')
  return { name, url: url.slice(0, 500) }
}

/**
 * The strategy a saved row describes, falling back to the default for
 * anything missing or senseless. Pure, so the rules are tested without a
 * database.
 */
export function roundStrategyOf(
  raw: unknown,
  fallback: RoundStrategy
): RoundStrategy {
  const r =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const sites = Array.isArray(r.sites)
    ? r.sites.map(siteOf).filter((s): s is Site => Boolean(s))
    : []
  const everyMin = Number(r.everyMin)
  const settleMs = Number(r.settleMs)
  return {
    sites: sites.length ? sites.slice(0, MAX_SITES) : fallback.sites,
    everyMin: Number.isFinite(everyMin)
      ? clamp(everyMin, MIN_EVERY_MIN, MAX_EVERY_MIN)
      : fallback.everyMin,
    settleMs: Number.isFinite(settleMs)
      ? clamp(settleMs, MIN_SETTLE_MS, MAX_SETTLE_MS)
      : fallback.settleMs,
  }
}

let ready = false
export async function ensureStrategies(q: Queryable): Promise<void> {
  if (ready) return
  await q.query(`CREATE TABLE IF NOT EXISTS agent_strategies (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    at timestamptz NOT NULL DEFAULT now()
  )`)
  ready = true
}
export function resetStrategiesForTests(): void {
  ready = false
}

/** The saved row, or null. Never throws: a strategy is an override. */
export async function readStrategy(
  q: Queryable,
  key: string
): Promise<unknown | null> {
  try {
    await ensureStrategies(q)
    const { rows } = await q.query(
      `SELECT value FROM agent_strategies WHERE key = $1`,
      [key]
    )
    const value = (rows[0] as { value?: unknown } | undefined)?.value
    return value === undefined ? null : value
  } catch (e) {
    console.warn('[strategies] not read:', String(e).slice(0, 160))
    return null
  }
}

/** Save a strategy. Returns what will be used from now on. */
export async function writeStrategy(
  q: Queryable,
  key: string,
  value: unknown
): Promise<void> {
  await ensureStrategies(q)
  await q.query(
    `INSERT INTO agent_strategies (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, at = now()`,
    [key, JSON.stringify(value ?? {})]
  )
}
