/**
 * REMOVE A PERSON FROM THE CRM — AND KEEP THEM REMOVED.
 *
 * Owner, 2026-09-23: "и кнопка удалить из crm! сразу неподходящих клиентов".
 * The CRM fills itself from his Telegram correspondence, so it holds everyone
 * he has ever written to: couriers, support bots, a stranger from two years
 * ago. Every one of them competes for the top of the list the sweep reads,
 * and the only verbs he had were "later" and "refuse" — both of which say
 * "come back to this person", which is the opposite of what he means.
 *
 * TWO THINGS HAPPEN, AND BOTH ARE NEEDED.
 *
 *  1. The cached correspondence is DELETED: `crm_messages`, `crm_touches`,
 *     `crm_people` and any open debt for that person. Every list in the CRM
 *     is derived from those rows, so the person disappears from all of them
 *     at once rather than from the four the author remembered.
 *  2. A MARK is written, because deletion alone does not hold: the next
 *     ingest reads Telegram again and would bring the same person straight
 *     back. `rememberMessagesFresh` refuses to store a dropped lead's
 *     messages, so the door stays shut without anybody having to remember
 *     this module.
 *
 * WHAT IS NOT TOUCHED. Nothing leaves Telegram: the conversation is still in
 * his chat list, and he can still write to the person by hand. No payment,
 * ledger row or token balance is read or changed here — money is not CRM
 * cache, and `payments_v2` is an archive nothing in this codebase writes.
 *
 * REVERSIBLE AS A DECISION, NOT AS A BACKUP. `restore: true` lifts the mark,
 * and the next ingest fills the correspondence back in from Telegram. What
 * was cached before the drop is gone for good, which is the honest shape: a
 * "delete" that secretly keeps everything is a lie the owner would find out
 * about at the worst moment.
 */
import type { AgentTool, ToolContext } from './tools'
import { requireSeller } from './telegram-tools'

export const DROPPED_TABLE = `CREATE TABLE IF NOT EXISTS crm_dropped (
  owner_id text NOT NULL,
  lead_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  since timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  PRIMARY KEY (owner_id, lead_id)
)`

export const DROPPED_LIST = `SELECT lead_id, since FROM crm_dropped
  WHERE owner_id = $1 AND active`

export const DROPPED_ONE = `SELECT 1 FROM crm_dropped
  WHERE owner_id = $1 AND lead_id = $2 AND active`

export const DROPPED_MARK = `INSERT INTO crm_dropped
  (owner_id, lead_id, active, since, restored_at)
  VALUES ($1, $2, true, now(), NULL)
  ON CONFLICT (owner_id, lead_id) DO UPDATE SET
    active = true, since = now(), restored_at = NULL`

export const DROPPED_RESTORE = `UPDATE crm_dropped
  SET active = false, restored_at = now()
  WHERE owner_id = $1 AND lead_id = $2 AND active
  RETURNING lead_id`

/** The cached rows a drop removes, in the order a foreign key would allow. */
export const DROP_PURGE = [
  `DELETE FROM crm_messages WHERE owner_id = $1 AND lead_id = $2`,
  `DELETE FROM crm_touches WHERE owner_id = $1 AND lead_id = $2`,
  `DELETE FROM crm_owed WHERE owner_id = $1 AND lead_id = $2`,
  `DELETE FROM crm_people WHERE owner_id = $1 AND lead_id = $2`,
] as const

type Pool = {
  query(sql: string, params?: unknown[]): Promise<{ rows?: any[] }>
}

/** Created once per pool; a test's fresh double gets its own CREATE. */
const ready = new WeakSet<object>()

async function ensure(pool: Pool): Promise<void> {
  if (ready.has(pool as object)) return
  await pool.query(DROPPED_TABLE)
  ready.add(pool as object)
}

/**
 * Whom this owner has dropped (lead id -> since, ISO).
 *
 * THROWS when the database cannot say. "Unknown" is not "nobody": a list that
 * silently shows a dropped person is the defect this exists to stop, and the
 * caller decides what to do with the throw.
 */
export async function droppedOf(
  pool: Pool,
  owner: string
): Promise<Map<string, string | null>> {
  await ensure(pool)
  const r = await pool.query(DROPPED_LIST, [String(owner)])
  const out = new Map<string, string | null>()
  for (const row of r.rows ?? []) {
    out.set(String((row as any).lead_id), (row as any).since ?? null)
  }
  return out
}

/**
 * Is this one person dropped? Used on the write path (a single lead), where
 * loading the whole list would be a query per message batch.
 *
 * FAILS OPEN, deliberately and narrowly: the caller is the message store, and
 * an unreadable table must not stop the CRM remembering everybody else's
 * correspondence. The lists above fail closed, so a dropped person who slips
 * back into the cache during an outage is still hidden from every list.
 */
export async function isDropped(
  pool: Pool,
  owner: string,
  lead: string
): Promise<boolean> {
  try {
    await ensure(pool)
    const r = await pool.query(DROPPED_ONE, [String(owner), String(lead)])
    return Boolean((r.rows ?? []).length)
  } catch {
    return false
  }
}

export interface DropResult {
  lead: string
  dropped: boolean
  removed: Record<string, number>
}

/** Mark and purge. Returns how many rows went, per table, so nothing is vague. */
export async function dropLead(
  pool: Pool,
  owner: string,
  lead: string
): Promise<DropResult> {
  await ensure(pool)
  await pool.query(DROPPED_MARK, [String(owner), String(lead)])
  const removed: Record<string, number> = {}
  for (const sql of DROP_PURGE) {
    const table = /DELETE FROM (\w+)/.exec(sql)?.[1] ?? 'unknown'
    try {
      const r = await pool.query(sql, [String(owner), String(lead)])
      removed[table] = Number((r as any).rowCount ?? (r.rows ?? []).length) || 0
    } catch {
      // A table this deployment does not have is not a failed drop: the mark
      // is what keeps the person out, and it is already written.
      removed[table] = 0
    }
  }
  return { lead: String(lead), dropped: true, removed }
}

/** Lift the mark. The correspondence comes back with the next ingest. */
export async function restoreLead(
  pool: Pool,
  owner: string,
  lead: string
): Promise<boolean> {
  await ensure(pool)
  const r = await pool.query(DROPPED_RESTORE, [String(owner), String(lead)])
  return Boolean((r.rows ?? []).length)
}

export const CRM_DROP_TOOLS: AgentTool[] = [
  {
    name: 'crm_drop',
    description:
      'Убрать человека из CRM насовсем: стереть кэш переписки (crm_messages, ' +
      'crm_touches, crm_people, долги) и поставить метку, чтобы следующая ' +
      'загрузка переписки не вернула его обратно. В Telegram ничего не ' +
      'удаляется, деньги не трогаются. restore=true — снять метку, переписка ' +
      'вернётся при следующей загрузке. Зовёт только сам продавец про своего ' +
      'человека.',
    parameters: {
      type: 'object',
      properties: {
        lead: {
          type: 'string',
          description: 'telegram_id человека (только цифры)',
        },
        restore: {
          type: 'boolean',
          description: 'вернуть человека в CRM вместо удаления',
        },
      },
      required: ['lead'],
      additionalProperties: false,
    },
    async handler(a: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const owner = String(ctx?.telegramId ?? '')
      const lead = String(a?.lead ?? '').trim()
      if (!/^\d{5,15}$/.test(lead))
        throw new Error('lead: telegram_id человека, только цифры')
      if (lead === owner) throw new Error('это ты сам — себя из CRM не убрать')
      const pool = ctx?.pool as never as Pool
      if (a?.restore === true) {
        const back = await restoreLead(pool, owner, lead)
        return {
          lead,
          restored: back,
          note: back
            ? 'метка снята; переписка вернётся при следующей загрузке'
            : 'этот человек и так не был удалён',
        }
      }
      return dropLead(pool, owner, lead)
    },
  },
]
