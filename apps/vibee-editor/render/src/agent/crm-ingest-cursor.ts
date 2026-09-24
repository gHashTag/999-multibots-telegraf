/**
 * WHERE THE DIALOG WALK STOPPED, PER OWNER (#2946).
 *
 * The ingest read the newest N dialogs and nothing older. A FLOOD_WAIT
 * halfway through a walk of two thousand meant the next run started from the
 * newest again, so the old half of the account was never reached, however
 * many times the walk ran. The cursor is the fix: a resumed run starts where
 * the last one stopped, and one that reaches the end starts over.
 *
 * Telegram pages dialogs by (offset_date, offset_id). The peer part of the
 * offset is left empty: a dialog sharing the same second may be read twice,
 * which the ingest already tolerates (ON CONFLICT DO NOTHING), and none is
 * skipped for good because the walk wraps.
 */

type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

export interface DialogCursor {
  offsetDate: number
  offsetId: number
}

/** The part of a GramJS Dialog the cursor needs. */
export interface CursorDialog {
  date?: number
  message?: { id?: number } | null
}

let ready = false

async function ensureTable(pool: Pool): Promise<void> {
  if (ready) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crm_ingest_cursors (
       owner_id    text PRIMARY KEY,
       offset_date bigint NOT NULL,
       offset_id   bigint NOT NULL,
       updated_at  timestamptz NOT NULL DEFAULT now()
     )`
  )
  ready = true
}

export function resetCursorTableForTests(): void {
  ready = false
}

export async function readCursor(
  pool: Pool,
  owner: string
): Promise<DialogCursor | null> {
  await ensureTable(pool)
  const { rows } = await pool.query(
    `SELECT offset_date, offset_id FROM crm_ingest_cursors WHERE owner_id = $1`,
    [owner]
  )
  const r = rows?.[0]
  if (!r) return null
  return { offsetDate: Number(r.offset_date), offsetId: Number(r.offset_id) }
}

/** null clears the cursor: the next resumed walk starts from the newest. */
export async function writeCursor(
  pool: Pool,
  owner: string,
  cursor: DialogCursor | null
): Promise<void> {
  await ensureTable(pool)
  if (!cursor) {
    await pool.query(`DELETE FROM crm_ingest_cursors WHERE owner_id = $1`, [
      owner,
    ])
    return
  }
  await pool.query(
    `INSERT INTO crm_ingest_cursors (owner_id, offset_date, offset_id, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (owner_id) DO UPDATE
       SET offset_date = EXCLUDED.offset_date,
           offset_id   = EXCLUDED.offset_id,
           updated_at  = now()`,
    [owner, cursor.offsetDate, cursor.offsetId]
  )
}

/** The offset that continues AFTER this dialog, or null if it has none. */
export function cursorAfter(d: CursorDialog | undefined): DialogCursor | null {
  const date = Number(d?.date)
  if (!d || !Number.isFinite(date) || date <= 0) return null
  return { offsetDate: date, offsetId: Number(d.message?.id) || 0 }
}

/**
 * Where the NEXT resumed run starts.
 *
 * - The page came back shorter than asked: the walk reached the oldest
 *   dialog, so it wraps (null).
 * - The walk stopped early (FLOOD_WAIT): continue after the last dialog that
 *   was finished, so the one that failed is read again. If none finished,
 *   keep the cursor it started from.
 * - Otherwise continue after the last dialog of the page.
 */
export function nextCursor(o: {
  page: CursorDialog[]
  asked: number
  lastDone: number
  stopped: boolean
  from: DialogCursor | null
}): DialogCursor | null {
  if (o.stopped) {
    return o.lastDone >= 0 ? cursorAfter(o.page[o.lastDone]) : o.from
  }
  if (o.page.length < o.asked) return null
  return cursorAfter(o.page[o.page.length - 1])
}
