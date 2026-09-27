/**
 * ONE CLIENT'S HISTORY ON ONE LINE OF TIME, AND THE NUMBERS ABOVE IT.
 *
 * Owner, 2026-09-26: the client card is the main dashboard -- a summary strip
 * at the top (how much we talked, when they last wrote, did they pay), and a
 * feed of everything that happened with this person in one place: the DMs,
 * what they said in groups we share, and our own touches (an offer written,
 * a purchase, a refusal, a note, a move pressed).
 *
 * Everything comes from tables the CRM already fills; nothing is fetched from
 * Telegram here. Each source is read on its own and a missing table costs
 * that source, never the answer. Read-only, seller-gated, and the lead must
 * be the owner's own (requireOwnLead) -- a feed is a dossier, and a dossier
 * of somebody else's client is exactly what must not open.
 */
import type { AgentTool, ToolContext } from './tools'
import { foreignText, requireSeller } from './telegram-tools'
import { requireOwnLead } from './crm-reach'
import { paidSetFor } from './crm-client-workspace-tools'

type Pool = { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }

export type TimelineKind = 'in' | 'out' | 'group' | 'touch'

export interface TimelineEvent {
  at: string
  kind: TimelineKind
  /** DM / group text, cut; a touch's note. */
  text: string
  /** For a touch: written, replied, later, refused, bought, note. */
  touch?: string
  /** For a group line: which group. */
  chat?: string
  chat_title?: string | null
}

export interface TimelineStats {
  inbound: number
  outbound: number
  group_posts: number
  touches: number
  first_at: string | null
  last_in_at: string | null
  last_out_at: string | null
  paid: boolean | null
  /**
   * Stars this person paid into the live wallet (token_ledger purchases; one
   * star is one token), and when last. null when the ledger could not be
   * read -- unknown is not zero.
   */
  revenue: number | null
  last_paid_at: string | null
}

const CUT = 280
const clip = (s: unknown) => {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > CUT ? `${t.slice(0, CUT - 1)}…` : t
}
const iso = (v: unknown): string | null => {
  const d = v instanceof Date ? v : new Date(String(v ?? ''))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function rowsOf(pool: Pool, sql: string, params: unknown[]) {
  try {
    return (await pool.query(sql, params)).rows
  } catch {
    return []
  }
}

/** Pure: newest first, at most `limit`, ties kept in source order. */
export function mergeTimeline(
  parts: TimelineEvent[][],
  limit: number
): TimelineEvent[] {
  return parts
    .flat()
    .map((e, i) => ({ e, i, t: new Date(e.at).getTime() }))
    .filter(x => Number.isFinite(x.t))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .slice(0, limit)
    .map(x => x.e)
}

export async function clientTimeline(
  pool: Pool,
  owner: string,
  lead: string,
  limit = 60
): Promise<{
  events: TimelineEvent[]
  stats: Omit<TimelineStats, 'paid' | 'revenue' | 'last_paid_at'>
}> {
  const dm = await rowsOf(
    pool,
    `SELECT at, "out", text FROM crm_messages
      WHERE owner_id = $1 AND lead_id = $2
      ORDER BY at DESC LIMIT $3`,
    [owner, lead, limit]
  )
  const groups = await rowsOf(
    pool,
    `SELECT m.at, m.text, m.chat_id, g.title
       FROM crm_group_messages m
       LEFT JOIN crm_groups g ON g.owner_id = m.owner_id AND g.chat_id = m.chat_id
      WHERE m.owner_id = $1 AND m.sender_id = $2
      ORDER BY m.at DESC LIMIT $3`,
    [owner, lead, limit]
  )
  const touches = await rowsOf(
    pool,
    `SELECT at, kind, note FROM crm_touches
      WHERE owner_id = $1 AND lead_id = $2
      ORDER BY at DESC LIMIT $3`,
    [owner, lead, limit]
  )
  const counts = (
    await rowsOf(
      pool,
      `SELECT count(*) FILTER (WHERE NOT "out")::int AS inbound,
              count(*) FILTER (WHERE "out")::int AS outbound,
              min(at) AS first_at,
              max(at) FILTER (WHERE NOT "out") AS last_in_at,
              max(at) FILTER (WHERE "out") AS last_out_at
         FROM crm_messages WHERE owner_id = $1 AND lead_id = $2`,
      [owner, lead]
    )
  )[0]
  const groupCount = (
    await rowsOf(
      pool,
      `SELECT count(*)::int AS n FROM crm_group_messages
        WHERE owner_id = $1 AND sender_id = $2`,
      [owner, lead]
    )
  )[0]
  const touchCount = (
    await rowsOf(
      pool,
      `SELECT count(*)::int AS n FROM crm_touches
        WHERE owner_id = $1 AND lead_id = $2`,
      [owner, lead]
    )
  )[0]

  const events = mergeTimeline(
    [
      dm.map(r => ({
        at: iso(r.at) ?? '',
        kind: (r.out ? 'out' : 'in') as TimelineKind,
        // Their words are third-party data; ours are ours.
        text: r.out ? clip(r.text) : foreignText(clip(r.text)),
      })),
      groups.map(r => ({
        at: iso(r.at) ?? '',
        kind: 'group' as const,
        text: foreignText(clip(r.text)),
        chat: String(r.chat_id),
        chat_title: r.title ? String(r.title) : null,
      })),
      touches.map(r => ({
        at: iso(r.at) ?? '',
        kind: 'touch' as const,
        touch: String(r.kind),
        text: clip(r.note),
      })),
    ],
    limit
  )
  const firsts = [iso(counts?.first_at)].filter(Boolean) as string[]
  return {
    events,
    stats: {
      inbound: Number(counts?.inbound) || 0,
      outbound: Number(counts?.outbound) || 0,
      group_posts: Number(groupCount?.n) || 0,
      touches: Number(touchCount?.n) || 0,
      first_at: firsts[0] ?? null,
      last_in_at: iso(counts?.last_in_at),
      last_out_at: iso(counts?.last_out_at),
    },
  }
}

/**
 * WHAT THIS CLIENT BROUGHT (CRM audit 2026-09-27, #4: no revenue number
 * anywhere). The live wallet is the one place a purchase lands since the
 * one-wallet decision; a grant is not money and is not counted. Never throws.
 */
export async function clientRevenue(
  pool: Pool,
  lead: string
): Promise<{ revenue: number | null; last_paid_at: string | null }> {
  try {
    const r = await pool.query(
      `SELECT coalesce(sum(delta), 0)::int AS stars, max(created_at) AS last
         FROM token_ledger
        WHERE telegram_id = $1 AND kind = 'purchase' AND delta > 0`,
      [lead]
    )
    const row = r.rows[0] ?? {}
    return {
      revenue: Number(row.stars) || 0,
      last_paid_at: iso(row.last),
    }
  } catch {
    return { revenue: null, last_paid_at: null }
  }
}

export const CRM_CLIENT_TIMELINE_TOOLS: AgentTool[] = [
  {
    name: 'crm_client_timeline',
    description:
      "One client's history on one line of time (DMs, their group messages, our touches) and summary counts, newest first. Read-only; for the app's client card.",
    parameters: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'telegram id of the client' },
        limit: { type: 'number', description: '10..200, default 60' },
      },
      required: ['client'],
      additionalProperties: false,
    },
    async handler(a: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const lead = String(a?.client ?? '').trim()
      if (!/^\d{5,15}$/.test(lead))
        throw new Error('client: a Telegram id of a person')
      await requireOwnLead(ctx, lead)
      const owner = String(ctx!.telegramId)
      const limit = Math.min(
        200,
        Math.max(10, Math.floor(Number(a?.limit) || 60))
      )
      const t = await clientTimeline(ctx!.pool as never, owner, lead, limit)
      const money = await paidSetFor(ctx!).catch(() => null)
      const brought = await clientRevenue(ctx!.pool as never, lead)
      const stats: TimelineStats = {
        ...t.stats,
        // null, not false, when payments could not be read: "unknown" is
        // not "never paid". Money in the wallet is payment even when the
        // paid list could not be read.
        paid:
          (brought.revenue ?? 0) > 0
            ? true
            : money && money.known
              ? money.paid.has(lead)
              : null,
        ...brought,
      }
      return { client: lead, stats, events: t.events }
    },
  },
]
