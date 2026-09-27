/**
 * WHAT THE OWNER'S CLIENTS HAVE BROUGHT, IN ONE STRIP.
 *
 * CRM audit 2026-09-27, #4: there was no revenue number anywhere. The client
 * card got its own (crm-client-timeline.ts `clientRevenue`); this is the
 * same reading summed over the whole audience -- total, last 30 days, paying
 * clients, the average per paying client (LTV) and the top five.
 *
 * ── MONEY IS READ FROM THE LIVE WALLET ONLY ────────────────────────────────
 *
 * One wallet (CLAUDE.md, 2026-09-20): every Stars purchase lands in
 * `token_ledger` as kind 'purchase' with delta > 0, one star one token. A
 * 'grant' is not money and is not counted. payments_v2 is an archive and is
 * not read here.
 *
 * ── WHO ARE "THE OWNER'S CLIENTS" ──────────────────────────────────────────
 *
 * The people the CRM screen shows the owner: `crm_people` and `crm_messages`
 * for owner_id = the caller, plus everyone the owner has invoiced
 * (`token_invoices.owner_id`, stamped by crm_offer). All three are local
 * tables, keyed by the owner, so nobody else's clients can come back.
 *
 * `visibleScope` + `tokenBuyers` (crm-tools.ts) was the other candidate and
 * was not taken: it scopes by the BOT a person walked into (users.bot_name in
 * Supabase), so for the platform owner (scope null) it returns the whole
 * farm's buyers -- the platform's revenue, not his clients' -- and it misses
 * a client the owner sold to in a DM who never opened his bot. The CRM screen
 * is the owner's DMs, so the sum follows the DMs.
 *
 * Never throws on a missing table: an audience source that fails costs that
 * source; a ledger that cannot be read answers nulls -- unknown, not zero.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireSeller } from './telegram-tools'

type Pool = { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }

export interface RevenueClient {
  id: string
  name: string | null
  stars: number
}

export interface CrmRevenue {
  /** Stars purchased all time by the owner's clients; null = unknown. */
  total: number | null
  /** Stars purchased in the last 30 days; null = unknown. */
  last_30d: number | null
  /** Clients with at least one purchase; null = unknown. */
  paying_clients: number | null
  /** total / paying_clients, rounded; null when unknown or nobody paid. */
  ltv: number | null
  /** Top five by stars, most first. Empty when unknown or nobody paid. */
  top: RevenueClient[]
}

const UNKNOWN: CrmRevenue = {
  total: null,
  last_30d: null,
  paying_clients: null,
  ltv: null,
  top: [],
}

const TOP = 5

/** The owner's audience; null when not a single source could be read. */
export async function ownerAudience(
  pool: Pool,
  owner: string
): Promise<Set<string> | null> {
  const sources = [
    `SELECT lead_id AS id FROM crm_people WHERE owner_id = $1`,
    `SELECT DISTINCT lead_id AS id FROM crm_messages WHERE owner_id = $1`,
    `SELECT DISTINCT telegram_id AS id FROM token_invoices WHERE owner_id = $1`,
  ]
  const ids = new Set<string>()
  let read = 0
  for (const sql of sources) {
    try {
      const r = await pool.query(sql, [owner])
      read++
      for (const row of r.rows) {
        const id = String(row?.id ?? '').trim()
        if (id) ids.add(id)
      }
    } catch {
      // A table this base has not grown yet costs its source only.
    }
  }
  // The owner's own purchases are not a client's revenue.
  ids.delete(owner)
  return read ? ids : null
}

export async function crmRevenue(
  pool: Pool,
  owner: string
): Promise<CrmRevenue> {
  const audience = await ownerAudience(pool, owner)
  if (!audience) return { ...UNKNOWN }
  if (!audience.size)
    return { total: 0, last_30d: 0, paying_clients: 0, ltv: null, top: [] }
  let rows: any[]
  try {
    rows = (
      await pool.query(
        `SELECT telegram_id,
                coalesce(sum(delta), 0)::int AS stars,
                coalesce(sum(delta) FILTER (
                  WHERE created_at > now() - interval '30 days'), 0)::int AS stars_30d
           FROM token_ledger
          WHERE kind = 'purchase' AND delta > 0
            AND telegram_id = ANY($1::text[])
          GROUP BY telegram_id`,
        [[...audience]]
      )
    ).rows
  } catch {
    return { ...UNKNOWN }
  }
  const paid = rows
    .map(r => ({
      id: String(r.telegram_id),
      stars: Number(r.stars) || 0,
      last30: Number(r.stars_30d) || 0,
    }))
    .filter(r => r.stars > 0 && audience.has(r.id))
  const total = paid.reduce((s, r) => s + r.stars, 0)
  const last30 = paid.reduce((s, r) => s + r.last30, 0)
  const top = [...paid]
    .sort((a, b) => b.stars - a.stars || a.id.localeCompare(b.id))
    .slice(0, TOP)
  const names = await namesOf(
    pool,
    owner,
    top.map(t => t.id)
  )
  return {
    total,
    last_30d: last30,
    paying_clients: paid.length,
    ltv: paid.length ? Math.round(total / paid.length) : null,
    top: top.map(t => ({
      id: t.id,
      name: names.get(t.id) ?? null,
      stars: t.stars,
    })),
  }
}

/** Names as the owner's CRM knows them; a missing table leaves ids bare. */
async function namesOf(
  pool: Pool,
  owner: string,
  ids: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  try {
    const r = await pool.query(
      `SELECT lead_id, first_name, last_name, username FROM crm_people
        WHERE owner_id = $1 AND lead_id = ANY($2::text[])`,
      [owner, ids]
    )
    for (const row of r.rows) {
      const full = [row.first_name, row.last_name]
        .map(v => String(v ?? '').trim())
        .filter(Boolean)
        .join(' ')
      const handle = String(row.username ?? '').trim()
      const name = full || (handle ? `@${handle}` : '')
      if (name) out.set(String(row.lead_id), name)
    }
  } catch {
    // Unnamed is still counted.
  }
  return out
}

export const CRM_REVENUE_TOOLS: AgentTool[] = [
  {
    name: 'crm_revenue',
    description:
      "Revenue from the owner's clients in the live wallet: total stars, last 30 days, paying clients, average per paying client, top 5. Read-only; for the app's CRM screen.",
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async handler(_a: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const owner = String(ctx!.telegramId)
      if (!ctx?.pool) return { ...UNKNOWN }
      return crmRevenue(ctx.pool as never, owner)
    },
  },
]
