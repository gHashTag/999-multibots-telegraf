/**
 * MEMORY OF WHAT WAS ALREADY DONE WITH A LEAD.
 *
 * `crm-tools.ts` counts the audience and shows who is worth writing to. That
 * half is built well, which is exactly why it looks finished. Measured
 * 2026-09-08: `grep -c "INSERT|UPDATE|CREATE TABLE" crm-tools.ts` is 0, and no
 * table anywhere in the repository records a touch on a lead.
 *
 * What that means at the desk: you open the hot leads, write to five of them,
 * and tomorrow the same five are in the list again, because nothing remembers
 * that you wrote. So you write again. That is the fastest way to get an account
 * limited and to lose somebody who was only still thinking.
 *
 * The defect has the same shape `tg_send` had: a tool that returns the right
 * answer and changes nothing in the world.
 *
 * ── RECORDING A TOUCH IS NOT AN OUTWARD ACTION ─────────────────────────────
 *
 * Nothing is sent from here. A touch changes OUR memory only, so it does not go
 * through the button confirmation that `tg_send` does. Sending is still
 * confirmed by a person, one message at a time.
 *
 * ── THE SAME BOUNDARY AS READING ───────────────────────────────────────────
 *
 * A touch may be recorded only about somebody you can already see. Otherwise
 * the table becomes a way to write into another owner's space: mark a stranger's
 * client "refused" and they drop out of that stranger's list. Visibility comes
 * from `hive/roles.ts`, as everywhere else, and is not recomputed here.
 *
 * ── WHY THIS DATABASE ──────────────────────────────────────────────────────
 *
 * The render service's own Postgres on Railway, where `tg_sessions`,
 * `tg_known_phones` and the hive journal already live. Not Supabase: DDL is not
 * reachable over PostgREST, and the platform's data has been moving to Railway.
 */

/** The little that is needed from a pool. Same shape as hive/journal.ts. */
export interface Pool {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

/**
 * What actually happened with a lead.
 *
 * The list is short and describes FACTS, not intentions. "Warm", "hot", "in
 * progress" are judgements everybody reads differently, and a month later
 * nothing can be counted from them. "Written", "replied", "bought" can.
 */
export type TouchKind =
  | 'written'
  | 'replied'
  | 'later'
  | 'refused'
  | 'bought'
  | 'note'

export const TOUCH_KINDS: TouchKind[] = [
  'written',
  'replied',
  'later',
  'refused',
  'bought',
  'note',
]

export interface Touch {
  /** Who reached out: the bot owner, not the lead. */
  owner: string
  /** Who was reached: a telegram_id from `users`. */
  lead: string
  /** Whose bot brought the lead, so a touch is scoped by the same visibility. */
  botName: string | null
  kind: TouchKind
  note?: string
}

let tableReady = false

/** For tests: make the next call run CREATE TABLE again. */
export function forgetTouchTable(): void {
  tableReady = false
}

async function ensureTable(pool: Pool): Promise<void> {
  if (tableReady) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crm_touches (
       id bigserial PRIMARY KEY,
       owner_id text NOT NULL,
       lead_id text NOT NULL,
       bot_name text,
       kind text NOT NULL,
       note text,
       at timestamptz NOT NULL DEFAULT now()
     )`
  )
  /*
   * Indexed on (owner_id, lead_id, at): every read asks "what did this owner do
   * with these people in the last N days". Without it that is a sequential scan
   * of the whole table on every list the person opens.
   */
  await pool.query(
    `CREATE INDEX IF NOT EXISTS crm_touches_owner_lead_at
       ON crm_touches (owner_id, lead_id, at DESC)`
  )
  tableReady = true
}

/**
 * Record a touch.
 *
 * DOES NOT THROW. Same principle as the hive journal: a failed write to our own
 * memory must not take down the conversation in which somebody just agreed
 * something. It reports what happened so the caller can say the truth.
 */
export async function recordTouch(
  pool: Pool,
  t: Touch
): Promise<'recorded' | 'not recorded'> {
  try {
    if (!t.owner || !t.lead) return 'not recorded'
    if (!TOUCH_KINDS.includes(t.kind)) return 'not recorded'
    await ensureTable(pool)
    await pool.query(
      `INSERT INTO crm_touches (owner_id, lead_id, bot_name, kind, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        String(t.owner),
        String(t.lead),
        t.botName ?? null,
        t.kind,
        t.note ? String(t.note).slice(0, 2000) : null,
      ]
    )
    return 'recorded'
  } catch {
    return 'not recorded'
  }
}

/**
 * Who this owner touched in the last `days` days.
 *
 * A Map of lead id to the latest touch, not a Set: showing "written to 3 days
 * ago" is more use than silently dropping the person from a list, and a lead
 * that vanishes without a word looks lost rather than handled.
 *
 * An empty Map on any failure. A list of leads withheld because the touch
 * memory broke is worse than a list with extra people in it: in the second case
 * you can see what is happening.
 */
export async function touchedSince(
  pool: Pool,
  owner: string,
  days: number
): Promise<Map<string, { kind: TouchKind; at: string }>> {
  const out = new Map<string, { kind: TouchKind; at: string }>()
  try {
    if (!owner) return out
    await ensureTable(pool)
    const r = await pool.query(
      `SELECT DISTINCT ON (lead_id) lead_id, kind, at
         FROM crm_touches
        WHERE owner_id = $1 AND at > now() - ($2 || ' days')::interval
        ORDER BY lead_id, at DESC`,
      [String(owner), String(Math.max(1, Math.floor(days)))]
    )
    for (const row of r.rows ?? []) {
      out.set(String(row.lead_id), {
        kind: row.kind as TouchKind,
        at: String(row.at),
      })
    }
    return out
  } catch {
    return out
  }
}

/** The whole history for one person, newest first. For a lead's card. */
export async function touchesFor(
  pool: Pool,
  owner: string,
  lead: string,
  limit = 20
): Promise<Array<{ kind: TouchKind; note: string | null; at: string }>> {
  try {
    if (!owner || !lead) return []
    await ensureTable(pool)
    const r = await pool.query(
      `SELECT kind, note, at FROM crm_touches
        WHERE owner_id = $1 AND lead_id = $2
        ORDER BY at DESC LIMIT $3`,
      [String(owner), String(lead), Math.max(1, Math.min(100, limit))]
    )
    return (r.rows ?? []).map(row => ({
      kind: row.kind as TouchKind,
      note: row.note ?? null,
      at: String(row.at),
    }))
  } catch {
    return []
  }
}
