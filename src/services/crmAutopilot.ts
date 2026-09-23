/**
 * AUTOPILOT: THE OWNER'S PRESS, GIVEN IN ADVANCE.
 *
 * Owner, 2026-09-23: an autopilot button, in every case where a press is
 * needed today. Until now every message leaving his account waited for a tap
 * on a card. Measured the same morning: the proactive sweep returned `held` for
 * EVERY owner -- "карточка уже ждёт нажатия" -- and one client had been
 * waiting nine days. The gate was doing its job and the business was standing
 * still.
 *
 * So the press becomes something he can give ONCE, for a while, instead of
 * once per card. What autopilot is NOT: it is not a removal of the gate. A
 * card is still drawn, still costs what it costs, still carries the words --
 * and every automatic send is reported to him in the same chat, immediately,
 * with the button that switches it off in that message.
 *
 * FOUR LIMITS, ALL OF THEM DELIBERATE.
 *
 *  1. It EXPIRES (`AUTOPILOT_HOURS`). A switch with no end is a switch nobody
 *     remembers throwing; this one dies by itself and says when.
 *  2. It has a DAILY CAP (`AUTOPILOT_DAILY_CAP`). A loop that goes wrong
 *     spends the cap and stops, instead of writing to everybody the owner has
 *     ever spoken to.
 *  3. It is PER OWNER. The row is keyed by his telegram id; nobody's
 *     autopilot sends from anybody else's account.
 *  4. It never overrides a REFUSAL. A person who was put off, refused or
 *     dropped is not in the sweep's list at all, and autopilot only ever
 *     presses a card the sweep already drew.
 *
 * WHEN THE DATABASE CANNOT ANSWER, AUTOPILOT IS OFF. This is the opposite of
 * `assistantOptOut`, where an unknown answer must not silence a client: here
 * the unknown answer is "may I send from his account without asking", and the
 * only safe reading of silence is no. A switch this process threw is still
 * honoured from memory, so a database blip mid-session does not strand him.
 *
 * TABLE CREATED ON FIRST USE, as `assistant_opt_outs` and `user_tokens` are:
 * this repository has no migration runner, and a second convention would be a
 * schema nobody runs.
 */

import { Pool } from 'pg'
import { logger } from '@/utils/logger'

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

/** How long one press of the switch lasts. */
export const AUTOPILOT_HOURS = 8
/** How many automatic sends one owner gets in a calendar day (UTC). */
export const AUTOPILOT_DAILY_CAP = 20
/** How long a decision may wait for the database before it is "off". */
export const AUTOPILOT_READ_MS = 2_000

export const AUTOPILOT_TABLE = `CREATE TABLE IF NOT EXISTS crm_autopilot (
  owner_id text PRIMARY KEY,
  until timestamptz NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  sent_today integer NOT NULL DEFAULT 0,
  turned_on_at timestamptz NOT NULL DEFAULT now(),
  turned_off_at timestamptz,
  scope text NOT NULL DEFAULT 'all'
)`

/**
 * THE COLUMN FOR A TABLE THAT ALREADY EXISTS.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that is already there,
 * and this one is: the switch shipped a day before its scope did. Without this
 * line the new column exists only on a database nobody has yet.
 */
export const AUTOPILOT_SCOPE_COLUMN = `ALTER TABLE crm_autopilot
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'all'`

/**
 * WHOM AUTO MAY WRITE TO WHEN THE SCOPE IS `chosen`.
 *
 * Every product in this space scopes its automation to an audience rather
 * than to everybody -- Fin's own setup page is called "set up Fin's
 * audience". Ours was all-or-nothing, which makes the honest answer to "shall
 * I turn it on?" a flinch: the owner is not afraid of automation, he is
 * afraid of it writing to the WRONG person.
 *
 * A row here is a person he picked. No row, and with `scope = 'chosen'`
 * nothing leaves for them -- the card waits for a press, exactly as before.
 */
export const AUTOPILOT_LEADS_TABLE = `CREATE TABLE IF NOT EXISTS crm_autopilot_leads (
  owner_id text NOT NULL,
  lead_id text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, lead_id)
)`

export const AUTOPILOT_LEAD_ADD = `INSERT INTO crm_autopilot_leads (owner_id, lead_id)
  VALUES ($1, $2) ON CONFLICT DO NOTHING`

export const AUTOPILOT_LEAD_REMOVE = `DELETE FROM crm_autopilot_leads
  WHERE owner_id = $1 AND lead_id = $2`

export const AUTOPILOT_LEAD_LIST = `SELECT lead_id FROM crm_autopilot_leads
  WHERE owner_id = $1 ORDER BY added_at DESC`

/** Is this one person chosen? Asked on the send path, so it is one row. */
export const AUTOPILOT_LEAD_ONE = `SELECT 1 FROM crm_autopilot_leads
  WHERE owner_id = $1 AND lead_id = $2`

/** Switch on, or extend: a second press starts the window again from now. */
export const AUTOPILOT_ON = `INSERT INTO crm_autopilot
  (owner_id, until, day, sent_today, turned_on_at, turned_off_at, scope)
  VALUES ($1, now() + ($2 || ' hours')::interval,
          (now() AT TIME ZONE 'utc')::date, 0, now(), NULL, $3)
  ON CONFLICT (owner_id) DO UPDATE SET
    until = now() + ($2 || ' hours')::interval,
    day = (now() AT TIME ZONE 'utc')::date,
    sent_today = 0,
    turned_on_at = now(),
    turned_off_at = NULL,
    scope = $3
  RETURNING until, scope`

/** Switch off NOW. `until` is moved into the past so no read can miss it. */
export const AUTOPILOT_OFF = `UPDATE crm_autopilot
  SET until = now() - interval '1 second', turned_off_at = now()
  WHERE owner_id = $1
  RETURNING owner_id`

export const AUTOPILOT_READ = `SELECT until, day, sent_today, scope
  FROM crm_autopilot WHERE owner_id = $1`

/**
 * Take one send out of today's budget, and only if the window is still open.
 *
 * ONE STATEMENT, because two processes draw cards at the same time: the bot's
 * sweep and a scoped run from a press. A read-then-write here would let both
 * see nineteen and both send, which is exactly the double-spend this codebase
 * already pays for elsewhere in the wallet. The day rolls over inside the
 * same statement, so a stale `day` cannot hold yesterday's count against
 * today.
 */
/**
 * ONE STATEMENT THAT ALSO ASKS WHETHER THIS PERSON WAS CHOSEN.
 *
 * The scope could have been checked separately, before taking the budget --
 * and then two sweeps racing on the last send of the day would both read
 * "chosen", both take it, and one of them would be wrong. It is the same
 * double-spend the budget itself is shaped against, so it lives in the same
 * statement: `$3` is the lead, and with `scope = 'chosen'` the row must exist
 * in `crm_autopilot_leads`.
 */
export const AUTOPILOT_TAKE = `UPDATE crm_autopilot SET
    day = (now() AT TIME ZONE 'utc')::date,
    sent_today = CASE
      WHEN day = (now() AT TIME ZONE 'utc')::date THEN sent_today + 1
      ELSE 1
    END
  WHERE owner_id = $1
    AND until > now()
    AND (day <> (now() AT TIME ZONE 'utc')::date OR sent_today < $2)
    AND (
      scope <> 'chosen'
      OR EXISTS (
        SELECT 1 FROM crm_autopilot_leads l
         WHERE l.owner_id = crm_autopilot.owner_id AND l.lead_id = $3
      )
    )
  RETURNING sent_today`

let pool: Pool | null = null
let injected: Db | null = null
let schemaReady: Promise<void> | null = null
let unconfiguredSaid = false

/**
 * What this process was told, for the moments the database cannot answer.
 *
 * Only an OFF is remembered as an answer in its own right: "he switched it
 * off here" must survive a database that stopped answering a second later.
 * An ON is NOT honoured from memory when the database is unreachable -- the
 * budget lives in the row, and sending without being able to count is the
 * failure this module is shaped to avoid.
 */
const offHere = new Set<string>()

function db(): Db | null {
  if (injected) return injected
  if (pool) return pool
  const url =
    process.env.TOKENS_DATABASE_URL || process.env.RENDER_DATABASE_URL || ''
  if (!url) {
    if (!unconfiguredSaid) {
      unconfiguredSaid = true
      logger.error(
        '[autopilot] TOKENS_DATABASE_URL is not set: the switch cannot be stored, every card waits for a press',
        {}
      )
    }
    return null
  }
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: AUTOPILOT_READ_MS,
    idle_in_transaction_session_timeout: 10_000,
  })
  pool.on('error', error => {
    logger.error('[autopilot] pool error', { error: error.message })
  })
  return pool
}

/** For tests: a database double, or null to go back to the environment. */
export function setAutopilotDbForTests(d: Db | null): void {
  injected = d
  schemaReady = null
}

/** For tests: forget what this "process" was told -- a restart. */
export function forgetAutopilotMemoryForTests(): void {
  offHere.clear()
  schemaReady = null
}

function ensureSchema(d: Db): Promise<void> {
  if (schemaReady) return schemaReady
  /*
   * Three statements, in this order: the table, the column a table that
   * already exists is missing, and the list of chosen people. All three are
   * idempotent, and all three must be there before a send is taken -- the
   * TAKE statement joins the third one.
   */
  schemaReady = d
    .query(AUTOPILOT_TABLE)
    .then(() => d.query(AUTOPILOT_SCOPE_COLUMN))
    .then(() => d.query(AUTOPILOT_LEADS_TABLE))
    .then(() => undefined)
    .catch(error => {
      // A failed attempt must not latch: the next call retries.
      schemaReady = null
      throw error
    })
  return schemaReady
}

export type AutopilotScope = 'all' | 'chosen'

export interface AutopilotState {
  on: boolean
  /**
   * When the window ends -- or ENDED. Present whether it is open or shut,
   * because "it closed at 04:20" is exactly what the first card after it has
   * to say (crmProactive.ts autopilotClosedLine), and a field that vanishes
   * when the switch goes off cannot say it.
   */
  until?: Date
  /** Whom it may write to: everybody, or only the people he picked. */
  scope: AutopilotScope
  /** How many people are picked; 0 with `scope: 'chosen'` means nothing sends. */
  chosen: number
  /** Sends already spent today, for the line the owner reads. */
  sentToday: number
  /** What is left of today's cap, never below zero. */
  left: number
  /** True when the database could not be asked: treated as off. */
  unknown?: boolean
}

const OFF: AutopilotState = {
  on: false,
  scope: 'all',
  chosen: 0,
  sentToday: 0,
  left: 0,
}

/** Is autopilot on for this owner right now, and how much is left today. */
export async function autopilotState(
  ownerId: string | number
): Promise<AutopilotState> {
  const owner = String(ownerId)
  if (offHere.has(owner)) return OFF
  const d = db()
  if (!d) return { ...OFF, unknown: true }
  try {
    await ensureSchema(d)
    const { rows } = await d.query(AUTOPILOT_READ, [owner])
    const row = rows[0]
    if (!row) return OFF
    const until = new Date(row.until)
    const on = until.getTime() > Date.now()
    const today = new Date().toISOString().slice(0, 10)
    const sameDay = String(row.day).slice(0, 10) === today
    const sentToday = sameDay ? Number(row.sent_today) || 0 : 0
    const scope: AutopilotScope = row.scope === 'chosen' ? 'chosen' : 'all'
    let chosen = 0
    if (scope === 'chosen') {
      try {
        const list = await d.query(AUTOPILOT_LEAD_LIST, [owner])
        chosen = (list.rows ?? []).length
      } catch {
        // The count is for the screen; an unreadable list must not turn the
        // switch's own state into "unknown".
      }
    }
    return {
      on,
      scope,
      chosen,
      until,
      sentToday,
      left: Math.max(0, AUTOPILOT_DAILY_CAP - sentToday),
    }
  } catch (error) {
    logger.error('[autopilot] could not read the switch, treating it as off', {
      owner,
      error: error instanceof Error ? error.message : String(error),
    })
    return { ...OFF, unknown: true }
  }
}

/** Throw the switch on for `AUTOPILOT_HOURS`. Returns when it dies. */
export async function turnAutopilotOn(
  ownerId: string | number,
  hours = AUTOPILOT_HOURS,
  scope: AutopilotScope = 'all'
): Promise<Date | null> {
  const owner = String(ownerId)
  const d = db()
  if (!d) return null
  try {
    await ensureSchema(d)
    const { rows } = await d.query(AUTOPILOT_ON, [owner, String(hours), scope])
    offHere.delete(owner)
    return rows[0] ? new Date(rows[0].until) : null
  } catch (error) {
    logger.error('[autopilot] could not switch on', {
      owner,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Switch off. Remembered HERE as well as written: an owner who presses stop
 * has said the one thing that must survive a database that stops answering.
 */
export async function turnAutopilotOff(
  ownerId: string | number
): Promise<boolean> {
  const owner = String(ownerId)
  offHere.add(owner)
  const d = db()
  if (!d) return false
  try {
    await ensureSchema(d)
    await d.query(AUTOPILOT_OFF, [owner])
    return true
  } catch (error) {
    logger.error('[autopilot] could not switch off in the database', {
      owner,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * MAY THIS CARD BE SENT WITHOUT A PRESS? Takes one out of today's budget.
 *
 * True is an authorisation and is spent: the caller sends. False means the
 * card waits for a tap -- switched off, expired, capped, or unanswerable.
 */
export async function takeAutopilotSend(
  ownerId: string | number,
  /**
   * WHO THE CARD IS FOR. With `scope: 'chosen'` a card for anybody else waits
   * for a press -- and an unnamed lead is nobody, so it waits too: a send
   * whose recipient this code cannot name is not one to make by itself.
   */
  leadId?: string | number
): Promise<boolean> {
  const owner = String(ownerId)
  if (offHere.has(owner)) return false
  const d = db()
  if (!d) return false
  try {
    await ensureSchema(d)
    const { rows } = await d.query(AUTOPILOT_TAKE, [
      owner,
      AUTOPILOT_DAILY_CAP,
      String(leadId ?? ''),
    ])
    return rows.length > 0
  } catch (error) {
    logger.error('[autopilot] could not take a send: the card waits', {
      owner,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/** Pick a person for AUTO, or unpick them. Owner's own act, from his screens. */
export async function chooseAutopilotLead(
  ownerId: string | number,
  leadId: string | number,
  on: boolean
): Promise<boolean> {
  const d = db()
  if (!d) return false
  try {
    await ensureSchema(d)
    await d.query(on ? AUTOPILOT_LEAD_ADD : AUTOPILOT_LEAD_REMOVE, [
      String(ownerId),
      String(leadId),
    ])
    return true
  } catch (error) {
    logger.error('[autopilot] could not change the chosen list', {
      owner: String(ownerId),
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/** Whom he picked. Empty on failure -- the screen says "none", never invents. */
export async function autopilotLeads(
  ownerId: string | number
): Promise<string[]> {
  const d = db()
  if (!d) return []
  try {
    await ensureSchema(d)
    const { rows } = await d.query(AUTOPILOT_LEAD_LIST, [String(ownerId)])
    return (rows ?? []).map(r => String(r.lead_id))
  } catch {
    return []
  }
}
