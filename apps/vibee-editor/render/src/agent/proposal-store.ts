import { onPersist, restoreProposals } from './tg-proposals'
import type { PendingProposal } from './tg-proposals'

/**
 * THE CARDS SURVIVE A DEPLOY.
 *
 * The proposal queue is a Map in one process. Every restart dropped every
 * card the owner had not yet pressed, and this repository deploys several
 * times a day -- so a card raised from ten minutes to twelve hours still
 * usually died within a couple of them. The owner asked, in as many words,
 * for the cards to be saved -- and called it obligatory.
 *
 * The queue owns no database, exactly as the orphan listener owns none: the
 * server hands one in at startup. This module is that hand.
 *
 * WHAT IS WRITTEN, AND WHAT IS NOT. Never the plaintext secret -- only its
 * SHA-256. The digest is all `claim` needs, and it cannot be handed out, so a
 * row is not a card. A person with a database dump gets a list of drafts they
 * still cannot confirm.
 *
 * WHAT THIS BUYS: survival of a restart. Not exactly-once durability. Writes
 * are fire-and-forget because a slow database must not hold up the button
 * press that caused them, so a crash in the microseconds between the press
 * and the write loses the same card it would have lost before.
 */
type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}
type GetPool = () => Pool | Promise<Pool>

// owner-scope: per process: wiring happens once
let wired = false

const DDL = `
  CREATE TABLE IF NOT EXISTS agent_proposals (
    id            text PRIMARY KEY,
    telegram_id   text NOT NULL,
    created_at    timestamptz NOT NULL,
    issued        boolean NOT NULL DEFAULT false,
    secret_digest text NOT NULL,
    payload       jsonb NOT NULL
  )`

/**
 * The columns are the ones a query needs to answer without opening the blob:
 * whose it is, when it was made, whether it was issued. Everything else rides
 * in `payload`, because the draft's shape belongs to the queue and adding a
 * field there should not need a migration here.
 */
async function ensureTable(pool: Pool): Promise<void> {
  await pool.query(DDL)
}

/** The row shape, back into the draft the queue understands. */
export function rowToProposal(row: {
  id: string
  telegram_id: string
  created_at: string | Date
  issued: boolean
  secret_digest: string
  payload: Record<string, unknown> | string
}): PendingProposal {
  const payload =
    typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  return {
    ...(payload as object),
    id: row.id,
    telegramId: String(row.telegram_id),
    createdAt: new Date(row.created_at).getTime(),
    issued: !!row.issued,
    secretDigest: String(row.secret_digest),
    // THE PLAINTEXT IS GONE ON PURPOSE. A restored draft was already issued,
    // so its secret is on the owner's phone and this process never says it
    // again. `issueFor` skips issued drafts, so the empty string is never
    // handed to anybody.
    secret: '',
  } as PendingProposal
}

/** The draft, minus what must never be written down. */
export function proposalToRow(p: PendingProposal): {
  id: string
  telegramId: string
  createdAt: Date
  issued: boolean
  secretDigest: string
  payload: string
} {
  const { secret: _secret, secretDigest: _digest, ...rest } = p
  void _secret
  void _digest
  return {
    id: p.id,
    telegramId: String(p.telegramId),
    createdAt: new Date(p.createdAt),
    issued: !!p.issued,
    secretDigest: p.secretDigest,
    payload: JSON.stringify(rest),
  }
}

/**
 * Register once per process, load what was waiting, and mirror from then on.
 *
 * The load runs BEFORE the store is registered so that the orphan reports it
 * makes -- for drafts that expired while we were down, and for drafts that
 * were never issued and can therefore never be confirmed -- delete their rows
 * through the same path everything else does.
 */
export async function wireProposalStore(getPool: GetPool): Promise<{
  restored: number
  expired: number
  unissued: number
  replaced: number
} | null> {
  if (wired) return null
  wired = true
  let pool: Pool
  try {
    pool = await getPool()
    await ensureTable(pool)
  } catch (e) {
    // A queue that cannot be mirrored still works; it just forgets on deploy,
    // which is where this started. Say so loudly rather than pretending.
    console.error(
      '[proposal-store] NOT WIRED — cards will not survive a restart:',
      String(e).slice(0, 200)
    )
    wired = false
    return null
  }

  onPersist({
    save: p => {
      const r = proposalToRow(p)
      void pool
        .query(
          `INSERT INTO agent_proposals
             (id, telegram_id, created_at, issued, secret_digest, payload)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           ON CONFLICT (id) DO UPDATE
             SET issued = EXCLUDED.issued, payload = EXCLUDED.payload`,
          [r.id, r.telegramId, r.createdAt, r.issued, r.secretDigest, r.payload]
        )
        .catch(e =>
          console.warn(
            '[proposal-store] save failed:',
            r.id,
            String(e).slice(0, 120)
          )
        )
    },
    remove: id => {
      void pool
        .query(`DELETE FROM agent_proposals WHERE id = $1`, [id])
        .catch(e =>
          console.warn(
            '[proposal-store] remove failed:',
            id,
            String(e).slice(0, 120)
          )
        )
    },
  })

  try {
    const { rows } = await pool.query(
      `SELECT id, telegram_id, created_at, issued, secret_digest, payload
         FROM agent_proposals ORDER BY created_at ASC`
    )
    const out = restoreProposals(rows.map(rowToProposal))
    console.log(
      `[proposal-store] restored ${out.restored}, expired ${out.expired}, ` +
        `unissued dropped ${out.unissued}, replaced ${out.replaced}`
    )
    return out
  } catch (e) {
    console.error(
      '[proposal-store] could not read waiting cards:',
      String(e).slice(0, 200)
    )
    return null
  }
}

/** For tests: forget the registration so the next wire takes effect. */
export function unwireProposalStore(): void {
  wired = false
  onPersist(null)
}
