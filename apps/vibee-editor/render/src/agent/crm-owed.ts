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

export interface OwedDebt {
  /** What was promised, in the owner's words: 'picture' today. */
  what: string
  /** Why it could not be given -- the provider's reason, trimmed. */
  why: string
  /** When the debt was taken on. Its age is what makes it urgent. */
  at: Date
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
              settled_at = NULL
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

/** The open debts of one owner, by lead id. Empty when the table is unreachable. */
export async function openDebts(
  pool: Pool,
  owner: string
): Promise<Map<string, OwedDebt>> {
  const out = new Map<string, OwedDebt>()
  try {
    await ensureOwedTable(pool)
    const r = await pool.query(
      `SELECT lead_id, what, why, at FROM crm_owed
        WHERE owner_id = $1 AND settled_at IS NULL`,
      [String(owner)]
    )
    for (const row of (r.rows ?? []) as any[]) {
      out.set(String(row.lead_id), {
        what: String(row.what ?? ''),
        why: String(row.why ?? ''),
        at: new Date(row.at),
      })
    }
  } catch {
    // See noteOwed: the queue without debts is the queue we had yesterday.
  }
  return out
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
