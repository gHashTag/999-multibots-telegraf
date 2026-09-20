/**
 * THE PROFILE BELONGS TO THE PERSON, NOT TO THE VISIT.
 *
 * A session is a visit: it is started, it is stopped, its row is deleted. The
 * profile is the point of the product -- the accounts the person signed into
 * themselves -- and it has to outlive every session or they sign in again
 * every time and nothing was gained.
 *
 * That is why this is a second table rather than a column on
 * `browser_sessions`: that row is deliberately deleted when the pod stops, and
 * a profile id deleted with it would orphan a disk full of somebody's cookies
 * that nothing can name any more.
 *
 * WHY THE ID IS OPAQUE. It ends up in a volume name, a directory, a backup
 * listing -- places a host operator reads casually. A Telegram id there says
 * WHO owns that pile of cookies; a random id says nothing. The mapping stays
 * in the database where it is already protected.
 *
 * WHAT THIS DOES NOT CLAIM. It stores nothing itself. The profile is a disk
 * the driver mounts, and encryption at rest is the platform's, not ours --
 * see docs/architecture/remote-browser-per-user.md §4.4 for what holding
 * somebody's cookies actually means.
 */

import type { Queryable } from './sessions'

let tableReady = false

export async function ensureBrowserProfiles(q: Queryable): Promise<void> {
  if (tableReady) return
  await q.query(
    `CREATE TABLE IF NOT EXISTS browser_profiles (
       telegram_id  text PRIMARY KEY,
       profile_id   text NOT NULL UNIQUE,
       created_at   timestamptz NOT NULL DEFAULT now(),
       last_used_at timestamptz NOT NULL DEFAULT now()
     )`,
    []
  )
  tableReady = true
}

/** Test seam: the cached flag would otherwise leak between test cases. */
export function resetBrowserProfilesCache(): void {
  tableReady = false
}

/**
 * The person's profile id, made once and returned forever after.
 *
 * `ON CONFLICT DO NOTHING` then read, rather than read-then-insert: two taps
 * arriving together must not mint two profiles for one person, because the
 * second would be an empty browser and the first one's logins would look
 * lost.
 */
export async function profileIdFor(
  q: Queryable,
  telegramId: string,
  newId: () => string
): Promise<string> {
  await q.query(
    `INSERT INTO browser_profiles (telegram_id, profile_id)
     VALUES ($1, $2)
     ON CONFLICT (telegram_id) DO NOTHING`,
    [telegramId, newId()]
  )
  const { rows } = await q.query(
    `UPDATE browser_profiles SET last_used_at = now()
      WHERE telegram_id = $1
      RETURNING profile_id`,
    [telegramId]
  )
  const id = rows[0]?.profile_id
  if (!id) throw new Error(`no profile row for ${telegramId} after insert`)
  return String(id)
}

/** What the person is about to lose, looked up before it is wiped. */
export async function readProfileId(
  q: Queryable,
  telegramId: string
): Promise<string | null> {
  const { rows } = await q.query(
    `SELECT profile_id FROM browser_profiles WHERE telegram_id = $1`,
    [telegramId]
  )
  return rows[0]?.profile_id ? String(rows[0].profile_id) : null
}

/**
 * Forget the person entirely. The row goes only after the disk is gone, so a
 * failure leaves a profile that is still findable rather than a nameless pile
 * of somebody's cookies.
 */
export async function forgetProfile(
  q: Queryable,
  telegramId: string
): Promise<void> {
  await q.query(`DELETE FROM browser_profiles WHERE telegram_id = $1`, [
    telegramId,
  ])
}
