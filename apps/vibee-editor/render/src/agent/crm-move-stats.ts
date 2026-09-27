/**
 * WHICH SALES MOVES WORK FOR THIS OWNER -- MEASURED, NOT ASSUMED.
 *
 * Owner, 2026-09-24: "develop a sales algorithm for our tasks that
 * accumulates experience and improves itself". The client card already
 * proposes moves from fixed rules (player lib/clientStrategy.ts: answer
 * before selling, the gift before an offer...). Rules are a starting point;
 * which of them actually move THIS owner's clients is a fact the CRM can
 * observe:
 *
 *   1. a move is USED when the owner presses it on a card -- the app records
 *      a `note` touch `move:<id>` (our memory only, nothing is sent);
 *   2. its OUTCOME is what the client did in the next 7 days: wrote back
 *      (an inbound message), bought (a `bought` touch or a purchase in the
 *      live wallet), or said no (a
 *      `refused` touch);
 *   3. each move gets counts and a score; the card ranks the moves it would
 *      offer anyway by that score once a move has been used a few times, and
 *      the Queen reads the table when she sets the agent tasks.
 *
 * So the system improves by use: moves that work rise, moves that do not
 * sink, and nobody has to edit a rule for it. It never INVENTS a move -- it
 * only reorders what the rules already allow, so "answer first" and "stop
 * when refused" can never be out-voted by statistics.
 *
 * Read-only, seller-gated, free. Pure scoring below, SQL in the tool.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireSeller } from './telegram-tools'

export const OUTCOME_DAYS = 7
/** A move needs this many uses before its score reorders anything. */
export const MIN_USES = 3

export interface MoveUse {
  lead: string
  move: string
  at: number
}
export interface LeadEvent {
  lead: string
  at: number
  kind: 'inbound' | 'bought' | 'refused'
}
export interface MoveStat {
  used: number
  replied: number
  bought: number
  refused: number
  /** (replied + 3·bought − 2·refused) / used, rounded to 2 places. */
  score: number
}

const DAY = 24 * 60 * 60 * 1000

/** Pure: per move, what followed each use within OUTCOME_DAYS. */
export function scoreMoves(
  uses: MoveUse[],
  events: LeadEvent[]
): Record<string, MoveStat> {
  const byLead = new Map<string, LeadEvent[]>()
  for (const e of events) {
    const list = byLead.get(e.lead) ?? []
    list.push(e)
    byLead.set(e.lead, list)
  }
  const out: Record<string, MoveStat> = {}
  for (const u of uses) {
    const s = (out[u.move] ??= {
      used: 0,
      replied: 0,
      bought: 0,
      refused: 0,
      score: 0,
    })
    s.used++
    const after = (byLead.get(u.lead) ?? []).filter(
      e => e.at > u.at && e.at <= u.at + OUTCOME_DAYS * DAY
    )
    if (after.some(e => e.kind === 'inbound')) s.replied++
    if (after.some(e => e.kind === 'bought')) s.bought++
    if (after.some(e => e.kind === 'refused')) s.refused++
  }
  for (const s of Object.values(out))
    s.score =
      Math.round(((s.replied + 3 * s.bought - 2 * s.refused) / s.used) * 100) /
      100
  return out
}

/** One line per move with enough uses, best first, for a prompt. */
export function moveStatsLine(stats: Record<string, MoveStat>): string {
  const rows = Object.entries(stats)
    .filter(([, s]) => s.used >= MIN_USES)
    .sort((a, b) => b[1].score - a[1].score)
  if (!rows.length) return ''
  return rows
    .map(
      ([move, s]) =>
        `${move}: применён ${s.used}, ответили ${s.replied}, купили ${s.bought}, отказались ${s.refused}` // cyrillic-ok: prompt copy
    )
    .join('\n')
}

type Pool = { query: (sql: string, p?: unknown[]) => Promise<{ rows: any[] }> }

/** The owner's move uses and their leads' outcomes over `days`. */
export async function moveStatsFor(
  pool: Pool,
  owner: string,
  days = 60
): Promise<Record<string, MoveStat>> {
  const span = String(Math.min(365, Math.max(7, Math.floor(days))))
  let uses: MoveUse[] = []
  try {
    const r = await pool.query(
      `SELECT lead_id, note, at FROM crm_touches
        WHERE owner_id = $1 AND kind = 'note' AND note LIKE 'move:%'
          AND at > now() - ($2 || ' days')::interval`,
      [owner, span]
    )
    uses = r.rows
      .map(x => ({
        lead: String(x.lead_id),
        move: String(x.note).slice(5).trim().split(/\s/)[0],
        at: new Date(x.at).getTime(),
      }))
      .filter(u => u.move && Number.isFinite(u.at))
  } catch {
    return {}
  }
  if (!uses.length) return {}
  const leads = [...new Set(uses.map(u => u.lead))]
  const events: LeadEvent[] = []
  try {
    const r = await pool.query(
      `SELECT lead_id, at FROM crm_messages
        WHERE owner_id = $1 AND "out" = false AND lead_id = ANY($2)
          AND at > now() - ($3 || ' days')::interval`,
      [owner, leads, String(Number(span) + OUTCOME_DAYS)]
    )
    for (const x of r.rows)
      events.push({
        lead: String(x.lead_id),
        at: new Date(x.at).getTime(),
        kind: 'inbound',
      })
  } catch {
    // No message memory yet: replies are simply not counted.
  }
  try {
    const r = await pool.query(
      `SELECT lead_id, kind, at FROM crm_touches
        WHERE owner_id = $1 AND kind IN ('bought', 'refused', 'replied')
          AND lead_id = ANY($2)
          AND at > now() - ($3 || ' days')::interval`,
      [owner, leads, String(Number(span) + OUTCOME_DAYS)]
    )
    for (const x of r.rows)
      events.push({
        lead: String(x.lead_id),
        at: new Date(x.at).getTime(),
        kind:
          x.kind === 'bought'
            ? 'bought'
            : x.kind === 'refused'
              ? 'refused'
              : 'inbound',
      })
  } catch {
    // Same: an unreadable table costs that outcome, not the answer.
  }
  /*
   * A PAYMENT IS A PURCHASE, TOUCH OR NO TOUCH (CRM audit 2026-09-27, #8).
   * A `bought` touch is written only for a token-charged delivery, never for
   * a Stars payment -- so the 3x weight of "bought" was near zero and a move
   * that led to money could not rise above one that led to chatter. Every
   * purchase lands in the live wallet (token_ledger 'purchase'; a grant is
   * not money). The lead's own id is the wallet key.
   */
  try {
    const r = await pool.query(
      `SELECT telegram_id, created_at FROM token_ledger
        WHERE kind = 'purchase' AND delta > 0 AND telegram_id = ANY($1)
          AND created_at > now() - ($2 || ' days')::interval`,
      [leads, String(Number(span) + OUTCOME_DAYS)]
    )
    for (const x of r.rows ?? [])
      events.push({
        lead: String(x.telegram_id),
        at: new Date(x.created_at).getTime(),
        kind: 'bought',
      })
  } catch {
    // No wallet table here: payments are simply not counted.
  }
  return scoreMoves(uses, events)
}

export const CRM_MOVE_STATS_TOOLS: AgentTool[] = [
  {
    name: 'crm_move_stats',
    description:
      'Which sales moves worked for this owner: per move pressed on a client card (note "move:<id>"), how many clients replied, bought or refused within 7 days. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '7..365, default 60' },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const owner = String(ctx!.telegramId)
      const days = Number(args.days) || 60
      const moves = await moveStatsFor(ctx!.pool as never, owner, days)
      return {
        moves,
        min_uses: MIN_USES,
        outcome_days: OUTCOME_DAYS,
        window_days: days,
      }
    },
  },
]
