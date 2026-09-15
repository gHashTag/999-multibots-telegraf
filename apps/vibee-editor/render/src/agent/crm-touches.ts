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

/** A usable event time, or null for "now". Junk is not written as 1970. */
function whenHappened(at: Date | string | undefined): string | null {
  if (at === undefined || at === null) return null
  const d = at instanceof Date ? at : new Date(String(at))
  const ms = d.getTime()
  return Number.isFinite(ms) ? d.toISOString() : null
}

export interface Touch {
  /** Who reached out: the bot owner, not the lead. */
  owner: string
  /** Who was reached: a telegram_id from `users`. */
  lead: string
  /** Whose bot brought the lead, so a touch is scoped by the same visibility. */
  botName: string | null
  kind: TouchKind
  note?: string
  /**
   * When it HAPPENED, if that is not now.
   *
   * The column defaulted to now() and nothing ever overrode it, which was
   * wrong in two ways at once. A sweep re-reading an old dialogue stamped
   * today onto an answer from three weeks ago; and worse, a touch derived
   * from a message was stamped AFTER the message it describes was already
   * stored, so `our last outbound is older than this touch` -- the comparison
   * crm-segments.ts and crm-replies.ts both lean on -- read backwards.
   */
  at?: Date | string
  /**
   * The id of an earlier row this one cancels. A correction carries the SAME
   * kind as the act it takes back, so a reader that knows nothing about
   * corrections still sees a plausible history rather than a stray marker.
   */
  revertsId?: number | null
}

// owner-scope: per process: the DDL runs once, it is not about a person
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
  /*
   * CORRECTIONS, ADDED 2026-09-15. A mistake is never erased and never edited:
   * a later row names the id of the one it cancels, and both stay in the log
   * forever. See crm-supersede.ts for the fold that reads them.
   *
   * ADD COLUMN IF NOT EXISTS inside ensureTable, by the precedent of tools.ts
   * and token-invoice.ts: this database has no migrations directory.
   */
  await pool.query(
    'ALTER TABLE crm_touches ADD COLUMN IF NOT EXISTS reverts_id bigint'
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS crm_touches_owner_lead_at
       ON crm_touches (owner_id, lead_id, at DESC)`
  )
  /* Every fold asks "was this row cancelled"; without this that is a scan. */
  await pool.query(
    `CREATE INDEX IF NOT EXISTS crm_touches_reverts
       ON crm_touches (reverts_id) WHERE reverts_id IS NOT NULL`
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
      `INSERT INTO crm_touches (owner_id, lead_id, bot_name, kind, note, reverts_id, at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now()))`,
      [
        String(t.owner),
        String(t.lead),
        t.botName ?? null,
        t.kind,
        t.note ? String(t.note).slice(0, 2000) : null,
        typeof t.revertsId === 'number' && Number.isFinite(t.revertsId)
          ? Math.floor(t.revertsId)
          : null,
        // NULL means "now", so every existing caller keeps its behaviour.
        whenHappened(t.at),
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
    /*
     * DISTINCT ON CANNOT SURVIVE CORRECTIONS, AND THIS IS THE TRAP.
     *
     * The old query asked the database for the newest row per lead. With
     * corrections in the table the newest row is often the CORRECTION -- so the
     * caller would be told "the last thing you did was refuse him" about the
     * very act that was just taken back. Worse, a correction is invisible to a
     * one-row-per-lead query: its subject is not there to be cancelled.
     *
     * So the window is read whole and folded here. The volume is one owner's
     * touches over N days -- hundreds, not millions -- and the LIMIT keeps a
     * pathological log from becoming a pathological query.
     */
    const r = await pool.query(
      `SELECT id, lead_id, kind, at, reverts_id
         FROM crm_touches
        WHERE owner_id = $1 AND at > now() - ($2 || ' days')::interval
        ORDER BY at DESC LIMIT 20000`,
      [String(owner), String(Math.max(1, Math.floor(days)))]
    )
    const byLead = new Map<string, TouchRow[]>()
    for (const row of r.rows ?? []) {
      const lead = String(row.lead_id)
      const list = byLead.get(lead) ?? []
      list.push({
        id: row.id === null || row.id === undefined ? null : Number(row.id),
        kind: String(row.kind),
        at: String(row.at),
        revertsId:
          row.reverts_id === null || row.reverts_id === undefined
            ? null
            : Number(row.reverts_id),
      })
      byLead.set(lead, list)
    }
    for (const [lead, list] of byLead) {
      /*
       * Rows arrive newest-first, which is what the fold requires -- and the
       * ACT is what the callers want, not merely the newest row.
       *
       * This map is the single `touch` behind three decisions that choose the
       * queue: the score penalty, the veto on next='talk', and refusedLately
       * in segmentOf. All three branch on `kind`, and none of them has a
       * branch for `note`. So a note written on somebody who had refused made
       * the refusal invisible to every one of them, while the stage -- read
       * from the full history -- still said 'refused'. One card, two answers.
       */
      const live = lastAct(effectiveTouches(list))
      if (live) out.set(lead, { kind: live.kind as TouchKind, at: live.at })
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
): Promise<
  Array<{
    id: number | null
    kind: TouchKind
    note: string | null
    at: string
    revertsId: number | null
  }>
> {
  try {
    if (!owner || !lead) return []
    await ensureTable(pool)
    /*
     * THE ONE READ THAT IS DELIBERATELY NOT FOLDED.
     *
     * This feeds the person's card, and a card must show the struck-through
     * refusal and who lifted it. Folding here would tidy the mistake away,
     * which is the opposite of the point: the log is evidence, and evidence
     * that quietly loses its corrections is worth less than none.
     *
     * Callers that want state, not history, fold it themselves.
     */
    const r = await pool.query(
      `SELECT id, kind, note, at, reverts_id FROM crm_touches
        WHERE owner_id = $1 AND lead_id = $2
        ORDER BY at DESC LIMIT $3`,
      [String(owner), String(lead), Math.max(1, Math.min(100, limit))]
    )
    return (r.rows ?? []).map(row => ({
      id: row.id === null || row.id === undefined ? null : Number(row.id),
      kind: row.kind as TouchKind,
      note: row.note ?? null,
      at: String(row.at),
      revertsId:
        row.reverts_id === null || row.reverts_id === undefined
          ? null
          : Number(row.reverts_id),
    }))
  } catch {
    return []
  }
}

/**
 * Every touch this owner has, grouped by lead, newest first inside each group.
 *
 * One query rather than one per lead: the waiting list asks about every person
 * an owner has ever touched, and a query per person turns opening a screen into
 * a hundred round trips.
 *
 * Capped, because an owner with years of history should not pull all of it to
 * answer "who is waiting today". The cap is on ROWS, and the rows are ordered
 * newest first, so what falls off the end is the oldest history -- which does
 * not change who is waiting now.
 */
export async function touchesByLead(
  pool: Pool,
  owner: string,
  maxRows = 5000
): Promise<Map<string, Array<{ kind: TouchKind; at: string }>>> {
  const out = new Map<string, Array<{ kind: TouchKind; at: string }>>()
  try {
    if (!owner) return out
    await ensureTable(pool)
    const r = await pool.query(
      `SELECT id, lead_id, kind, at, reverts_id FROM crm_touches
        WHERE owner_id = $1
        ORDER BY at DESC LIMIT $2`,
      [String(owner), Math.max(1, Math.floor(maxRows))]
    )
    const raw = new Map<string, TouchRow[]>()
    for (const row of r.rows ?? []) {
      const lead = String(row.lead_id)
      const list = raw.get(lead) ?? []
      list.push({
        id: row.id === null || row.id === undefined ? null : Number(row.id),
        kind: String(row.kind),
        at: String(row.at),
        revertsId:
          row.reverts_id === null || row.reverts_id === undefined
            ? null
            : Number(row.reverts_id),
      })
      raw.set(lead, list)
    }
    // This feeds stageOf, which asks what is TRUE about a person, not what was
    // once written about them. Newest-first is preserved from the query.
    for (const [lead, list] of raw) {
      out.set(
        lead,
        effectiveTouches(list).map(t => ({
          kind: t.kind as TouchKind,
          at: t.at,
        }))
      )
    }
    return out
  } catch {
    return out
  }
}

/**
 * The notes the confirmed-send path writes. Named once so the summary can
 * count "how many of the recent 'написали' were the seller's own cards"
 * without guessing at the wording.
 */
export { SELLER_NOTE_PREFIXES } from './crm-notes'
import { SELLER_NOTE_PREFIXES } from './crm-notes'
import { effectiveTouches, lastAct, type TouchRow } from './crm-supersede'

const clampDays = (d: unknown): number =>
  Math.min(90, Math.max(1, Math.floor(Number(d) || 7)))

/** Every kind at once: how many ever, how many in the window, the last one. */
export async function touchesByKind(
  pool: Pool,
  owner: string,
  days = 7
): Promise<
  Array<{
    kind: TouchKind
    total: number
    recent: number
    last_at: string | null
  }>
> {
  try {
    if (!owner) return []
    await ensureTable(pool)
    const r = await pool.query(
      /*
       * COUNTED IN SQL, BUT ONLY OVER ACTS THAT STILL STAND.
       *
       * Two exclusions, and both are needed. A row that some LIVE correction
       * names is not an act any more, so it must not be counted -- otherwise
       * the summary keeps reporting a refusal the owner took back. And the
       * correction itself is bookkeeping about the log, so counting it would
       * report two refusals where the person was refused once and forgiven.
       *
       * The `NOT EXISTS` mirrors effectiveTouches for the depth this data
       * actually has. A correction that is itself corrected (undo of an undo)
       * is rare enough that the count may lag the fold by one; the fold is the
       * authority for STATE, this is a tally for a dashboard, and the sql-shape
       * test pins the two exclusions so neither is quietly dropped.
       */
      `SELECT kind,
              count(*)::int AS total,
              count(*) FILTER (WHERE at > now() - ($2 || ' days')::interval)::int AS recent,
              max(at) AS last_at
         FROM crm_touches t
        WHERE owner_id = $1
          AND t.reverts_id IS NULL
          AND NOT EXISTS (
                SELECT 1 FROM crm_touches c
                 WHERE c.reverts_id = t.id AND c.owner_id = t.owner_id
              )
        GROUP BY kind`,
      [String(owner), String(clampDays(days))]
    )
    return (r.rows ?? []).map((row: any) => ({
      kind: row.kind as TouchKind,
      total: Number(row.total ?? 0),
      recent: Number(row.recent ?? 0),
      last_at: row.last_at ? String(row.last_at) : null,
    }))
  } catch {
    return []
  }
}

/** How many of the window's sends came out of the seller's own cards. */
export async function sellerSendsSince(
  pool: Pool,
  owner: string,
  days = 7
): Promise<number> {
  try {
    if (!owner) return 0
    await ensureTable(pool)
    const r = await pool.query(
      /*
       * `reverts_id IS NULL` even though a send is never taken back: a receipt
       * cannot be revoked, because the message really left. The clause is here
       * so that a correction row -- which carries the SAME kind as what it
       * cancels -- can never be miscounted as another send.
       */
      `SELECT count(*)::int AS n FROM crm_touches
        WHERE owner_id = $1 AND kind IN ('written', 'bought')
          AND reverts_id IS NULL
          AND at > now() - ($2 || ' days')::interval
          AND (note LIKE $3 OR note LIKE $4)`,
      [
        String(owner),
        String(clampDays(days)),
        SELLER_NOTE_PREFIXES.message + '%',
        SELLER_NOTE_PREFIXES.service + '%',
      ]
    )
    return Number(r.rows?.[0]?.n ?? 0)
  } catch {
    return 0
  }
}
