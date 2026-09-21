/**
 * WHAT WE PROMISED AND DID NOT GIVE, WRITTEN DOWN AGAINST A NAME.
 *
 * MEASURED IN PRODUCTION 2026-09-21, on one lead of the platform owner.
 * She asked for a picture three times in four minutes -- 17:14:45, 17:17:46,
 * 17:18:24 -- while the drawing providers were timing out. The seller said so
 * honestly and sent her links to old files instead. Then fourteen hours of
 * nothing. Nobody was at fault at any single step, and that is the point:
 *
 *   - `image-health.ts` remembers THAT the provider is down, for thirty
 *     minutes, in one process, and nothing about WHOM it refused;
 *   - `noteGiftRefused` writes a journal line whose `who` is the SELLER, with
 *     a comment saying "nothing about the person", which is correct for a
 *     tally and useless for going back;
 *   - the queue in chat-memory.ts asks "did they speak last?". Our apology
 *     WAS our last word, so `unanswered` is false and `next` is `wait`. She
 *     re-enters the list two days later as small talk, or three days later as
 *     "no answer" -- for a picture she asked for today.
 *
 * So the promise gets an owner. One open row per person: what we owe, why it
 * could not be given, and since when. The queue reads it and puts them back at
 * the top no matter who spoke last; a picture that actually goes out settles
 * it. A debt nobody is holding is exactly how a client goes quiet.
 */
import type { Pool } from 'pg'
import { kieTaskIdIn, KIE_TASK_ID_RE } from '../kie-image'

export interface OwedDebt {
  /** What was promised, in the owner's words: 'picture' today. */
  what: string
  /** Why it could not be given -- the provider's reason, trimmed. */
  why: string
  /** When the debt was taken on. Its age is what makes it urgent. */
  at: Date
  /**
   * The provider task already drawing it, when there is one. A debt written
   * before this column existed still names it in `why`, and is read from
   * there (kieTaskIdIn), so an old debt is not paid for a second time either.
   */
  taskId?: string | null
  /** When that task was started: a picture still drawing is not chased. */
  taskAt?: Date | null
  /**
   * The finished picture, on our own storage, not yet handed over. The next
   * delivery gives THIS instead of drawing (and paying for) another one.
   */
  readyUrl?: string | null
  /**
   * WHO PAYS FOR THAT PORTRAIT, decided when it was started: 'gift' -- the
   * owner paid the drawing and the person gets it free; 'paid' -- nobody paid
   * yet, the person pays at the owner's press, as they would have had it come
   * on time. Null for a debt older than this column: those were all gifts.
   */
  taskMode?: 'gift' | 'paid' | null
}

let tableReady = false

export async function ensureOwedTable(pool: Pool): Promise<void> {
  if (tableReady) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crm_owed (
       owner_id   text NOT NULL,
       lead_id    text NOT NULL,
       what       text NOT NULL,
       why        text NOT NULL,
       at         timestamptz NOT NULL DEFAULT now(),
       settled_at timestamptz,
       PRIMARY KEY (owner_id, lead_id)
     )`
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS crm_owed_open
       ON crm_owed (owner_id) WHERE settled_at IS NULL`
  )
  /*
   * THE PICTURE THAT WAS ALREADY PAID FOR (late-picture.ts). The table is
   * live, so the columns are added, not declared above.
   */
  await pool.query(
    `ALTER TABLE crm_owed
       ADD COLUMN IF NOT EXISTS task_id   text,
       ADD COLUMN IF NOT EXISTS task_at   timestamptz,
       ADD COLUMN IF NOT EXISTS ready_url text,
       ADD COLUMN IF NOT EXISTS ready_at  timestamptz,
       ADD COLUMN IF NOT EXISTS task_mode text`
  )
  tableReady = true
}

/** For tests, which hand this module a fresh fake pool each time. */
export function forgetOwedTableForTests(): void {
  tableReady = false
}

/**
 * ASKED FOR A PICTURE, IN THEIR OWN WORDS.
 *
 * Deliberately narrow and deliberately dumb. The alternative -- ask the model
 * whether that was a request -- costs a turn and can answer differently twice
 * on the same sentence, and this decides whether a person is followed up, so
 * it has to be a rule the owner can read. A missed debt is the status quo; a
 * debt invented from the word "photo" in passing costs one extra follow-up.
 */
const ASKS_FOR_A_PICTURE =
  /(фото|фотк|картинк|портрет|изображени|нарисуй|отрисуй|сгенерир|photo|picture|portrait)/i // cyrillic-ok: the words people type
/*
 * No \b: JavaScript's word boundary is ASCII-only, so it never fires next to
 * a Cyrillic letter -- with it, the very word she typed ("Фото") did not
 * match. Stems without a boundary are the price, and they are cheap here:
 * this only runs while the pictures are already down.
 */

export function asksForAPicture(text: unknown): boolean {
  return ASKS_FOR_A_PICTURE.test(String(text ?? ''))
}

/**
 * Take on a debt. An already-open one is LEFT ALONE: its age is the whole
 * signal, and refreshing `at` on every failed retry would make an hours-old
 * promise look like it was made a second ago -- which is precisely the way
 * this person fell out of the queue the first time.
 *
 * A SETTLED ONE IS REOPENED AS A NEW PROMISE, WITH NOTHING OF THE OLD ONE ON
 * IT. Settling keeps the row's task and finished picture (they are the record
 * of what was handed over), and reopening used to keep them too: the next
 * request -- a different picture, asked for days later -- found the portrait
 * already given, "recovered" it and handed the same file over again with the
 * gift caption, while the queue told the seller "the portrait is ready". The
 * new promise has no task and no picture until attachTask or markReady gives
 * it its own.
 */
export async function noteOwed(
  pool: Pool,
  d: { owner: string; lead: string; what: string; why: unknown }
): Promise<void> {
  const owner = String(d.owner ?? '')
  const lead = String(d.lead ?? '')
  if (!owner || !lead || owner === lead) return
  try {
    await ensureOwedTable(pool)
    await pool.query(
      `INSERT INTO crm_owed (owner_id, lead_id, what, why)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (owner_id, lead_id) DO UPDATE
          SET what = EXCLUDED.what,
              why = EXCLUDED.why,
              at = now(),
              settled_at = NULL,
              task_id = NULL,
              task_at = NULL,
              ready_url = NULL,
              ready_at = NULL,
              task_mode = NULL
        WHERE crm_owed.settled_at IS NOT NULL`,
      [
        owner,
        lead,
        String(d.what).slice(0, 60),
        String(d.why ?? '').slice(0, 200),
      ]
    )
  } catch {
    /*
     * Bookkeeping must not change what the seller does this second. A debt
     * that could not be written down leaves us exactly where we were before
     * this file existed, which is survivable; a throw here would take down
     * the answer the person is waiting for, which is not.
     */
  }
}

const DEBT_COLUMNS = 'what, why, at, task_id, task_at, ready_url, task_mode'

function debtOfRow(row: any): OwedDebt {
  const why = String(row.why ?? '')
  return {
    what: String(row.what ?? ''),
    why,
    at: new Date(row.at),
    // The column first; an old debt names its task only in words.
    taskId: row.task_id ? String(row.task_id) : kieTaskIdIn(why),
    taskAt: row.task_at ? new Date(row.task_at) : null,
    readyUrl: row.ready_url ? String(row.ready_url) : null,
    taskMode:
      row.task_mode === 'gift' || row.task_mode === 'paid'
        ? row.task_mode
        : null,
  }
}

/** The open debts of one owner, by lead id. Empty when the table is unreachable. */
export async function openDebts(
  pool: Pool,
  owner: string
): Promise<Map<string, OwedDebt>> {
  const out = new Map<string, OwedDebt>()
  try {
    await ensureOwedTable(pool)
    const r = await pool.query(
      `SELECT lead_id, ${DEBT_COLUMNS} FROM crm_owed
        WHERE owner_id = $1 AND settled_at IS NULL`,
      [String(owner)]
    )
    for (const row of (r.rows ?? []) as any[]) {
      out.set(String(row.lead_id), debtOfRow(row))
    }
  } catch {
    // See noteOwed: the queue without debts is the queue we had yesterday.
  }
  return out
}

/** One person's open debt, or null. Null too when the table is unreachable. */
export async function debtOf(
  pool: Pool,
  owner: string,
  lead: string
): Promise<OwedDebt | null> {
  try {
    await ensureOwedTable(pool)
    const r = await pool.query(
      `SELECT ${DEBT_COLUMNS} FROM crm_owed
        WHERE owner_id = $1 AND lead_id = $2 AND settled_at IS NULL`,
      [String(owner), String(lead)]
    )
    const row = (r.rows ?? [])[0]
    return row ? debtOfRow(row) : null
  } catch {
    return null
  }
}

/**
 * THE PICTURE IS BEING DRAWN: remember by which task.
 *
 * The debt is taken on first (or left alone if it is already open -- its age
 * is still the signal), then the task id is written beside it. Kept in the
 * base, not only in the background watch, because the watch dies with the
 * process and a redeploy must not turn a paid portrait into a second payment.
 */
export async function attachTask(
  pool: Pool,
  d: {
    owner: string
    lead: string
    taskId: string
    why: unknown
    /** Who pays for this portrait (OwedDebt.taskMode); null when unknown. */
    mode?: 'gift' | 'paid' | null
  }
): Promise<void> {
  const owner = String(d.owner ?? '')
  const lead = String(d.lead ?? '')
  const taskId = String(d.taskId ?? '').trim()
  if (!owner || !lead || owner === lead || !taskId) return
  await noteOwed(pool, { owner, lead, what: 'picture', why: d.why })
  try {
    await pool.query(
      `UPDATE crm_owed
          SET task_id = $3, task_at = now(), ready_url = NULL, ready_at = NULL,
              task_mode = $4
        WHERE owner_id = $1 AND lead_id = $2 AND settled_at IS NULL`,
      [owner, lead, taskId, d.mode ?? null]
    )
  } catch {
    /* See noteOwed. */
  }
}

/**
 * THE PICTURE EXISTS, ON OUR STORAGE, AND THE PERSON HAS NOT GOT IT YET.
 *
 * The debt stays open -- they are still owed it -- but now it says what to
 * give, so the next delivery hands this over instead of drawing again. It is
 * settled when the card with it is prepared (crm-deliver-tool.ts).
 *
 * `reopen`: only the owner's explicit rescue may reopen a debt that was
 * already settled. A background watch that finishes after another picture
 * went out must not offer this person a second portrait.
 *
 * A debt that has since moved on to a newer task is not touched: a late
 * answer for an old task must not overwrite what the new one will bring.
 */
export async function markReady(
  pool: Pool,
  d: {
    owner: string
    lead: string
    url: string
    taskId: string
    reopen?: boolean
  }
): Promise<boolean> {
  const owner = String(d.owner ?? '')
  const lead = String(d.lead ?? '')
  const url = String(d.url ?? '')
  if (!owner || !lead || owner === lead || !/^https?:\/\//.test(url))
    return false
  const why = 'нарисован после хода' // cyrillic-ok: the owner reads this reason
  try {
    await ensureOwedTable(pool)
    if (d.reopen) {
      await noteOwed(pool, { owner, lead, what: 'picture', why })
    } else {
      await pool.query(
        `INSERT INTO crm_owed (owner_id, lead_id, what, why)
              VALUES ($1, $2, $3, $4)
         ON CONFLICT (owner_id, lead_id) DO NOTHING`,
        [owner, lead, 'picture', why]
      )
    }
    const r = await pool.query(
      `UPDATE crm_owed
          SET ready_url = $3, ready_at = now(), task_id = $4,
              task_at = COALESCE(task_at, now())
        WHERE owner_id = $1 AND lead_id = $2 AND settled_at IS NULL
          AND (task_id IS NULL OR task_id = $4)
        RETURNING lead_id`,
      [owner, lead, url, String(d.taskId ?? '')]
    )
    return (r.rows ?? []).length > 0
  } catch {
    return false
  }
}

/**
 * THAT TASK WILL NEVER BRING ANYTHING: forget it, keep the debt.
 *
 * The reason replaces the old words too, because an old debt names its task
 * in `why` -- left there, the next attempt would read the id again and ask
 * about a task the provider already refused.
 */
export async function clearTask(
  pool: Pool,
  d: { owner: string; lead: string; taskId: string; why: unknown }
): Promise<void> {
  try {
    await ensureOwedTable(pool)
    const why = String(d.why ?? '')
      .replace(new RegExp(KIE_TASK_ID_RE.source, 'gi'), '')
      .slice(0, 200)
    await pool.query(
      `UPDATE crm_owed
          SET task_id = NULL, task_at = NULL, task_mode = NULL, why = $4
        WHERE owner_id = $1 AND lead_id = $2 AND settled_at IS NULL
          AND (task_id = $3 OR task_id IS NULL)`,
      [String(d.owner), String(d.lead), String(d.taskId ?? ''), why]
    )
  } catch {
    /* See noteOwed. */
  }
}

/** The promise was kept. Settles only this person's debt, never the batch. */
export async function settleOwed(
  pool: Pool,
  owner: string,
  lead: string
): Promise<void> {
  try {
    await ensureOwedTable(pool)
    await pool.query(
      `UPDATE crm_owed SET settled_at = now()
        WHERE owner_id = $1 AND lead_id = $2 AND settled_at IS NULL`,
      [String(owner), String(lead)]
    )
  } catch {
    /* See noteOwed. */
  }
}
