/**
 * WHOSE LOGINS ARE IN THE POD AFTER THE SESSION ROW IS GONE.
 *
 * A session is a visit and its row is deleted on purpose -- that deletion is
 * what makes the viewer's token stop working, which is the part that matters
 * for safety. On this platform a pod cannot be stopped (`fixedDriver.stop` is
 * a documented no-op), so the deletion leaves a browser running with
 * somebody's accounts in it and nothing in the database naming it.
 *
 * Measured 2026-09-27: `browser_sessions` held zero rows while the pod held
 * nine pages and 192 cookies. Everything that asks "which of my networks is
 * connected?" goes through `loginsOfPerson`, which requires a live row -- so
 * for a whole day the honest answer "six networks are signed in" came back as
 * "not connected", and the owner read that as having been signed out. He had
 * not been. The row had.
 *
 * So the profile's tenant is remembered separately from the visit. Not as a
 * second home for session state: it stores ONE fact the session row cannot
 * keep, because the session row is meant to die -- which person's accounts
 * are on the disk this pod mounts.
 *
 * WHY NOT `browser_profiles`. That table maps person to profile id, and on a
 * provisioned pod the profile id is ignored: `fixedDriver.start` hands back
 * whatever volume the service has. The question here is the other direction
 * and about a specific pod: given this CDP address, whose browser is it.
 *
 * WHY THIS IS NOT A WIDER DOOR. It answers for exactly one person -- the one
 * already recorded as this pod's tenant -- and the caller must already be
 * that person. It grants nobody a look at anybody else's browser, and it
 * mints no token: a tenant may ask about their own logins, which they could
 * always do while their row happened to exist.
 */

import type { Queryable } from './sessions'

let tableReady = false

export async function ensurePodTenants(q: Queryable): Promise<void> {
  if (tableReady) return
  await q.query(
    `CREATE TABLE IF NOT EXISTS browser_pod_tenants (
       cdp_endpoint text PRIMARY KEY,
       telegram_id  text NOT NULL,
       updated_at   timestamptz NOT NULL DEFAULT now()
     )`,
    []
  )
  tableReady = true
}

/** Test seam: the cached flag would otherwise leak between test cases. */
export function resetPodTenantsCache(): void {
  tableReady = false
}

/**
 * Same pod, written two ways -- `host:9223`, `http://host:9223/`. Keyed on the
 * bare form so a configuration written with a scheme still finds the row.
 * Pure.
 */
export function bareEndpoint(s: string): string {
  return s
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/**
 * This person is using this pod now. Written when a session goes live, so the
 * fact survives the row that carried it.
 *
 * A pod has one tenant at a time: the primary key is the pod, and the newest
 * writer wins. That is the truth on the disk -- the profile a later session
 * mounted is the profile the pod now holds, whatever an older row said.
 */
export async function rememberPodTenant(
  q: Queryable,
  cdpEndpoint: string,
  telegramId: string
): Promise<void> {
  const key = bareEndpoint(cdpEndpoint)
  if (!key) return
  await q.query(
    `INSERT INTO browser_pod_tenants (cdp_endpoint, telegram_id)
     VALUES ($1, $2)
     ON CONFLICT (cdp_endpoint) DO UPDATE SET
       telegram_id = EXCLUDED.telegram_id,
       updated_at  = now()`,
    [key, telegramId]
  )
}

/** Whose pod this is, or null when nobody has ever been recorded on it. */
export async function podTenant(
  q: Queryable,
  cdpEndpoint: string
): Promise<string | null> {
  const key = bareEndpoint(cdpEndpoint)
  if (!key) return null
  const { rows } = await q.query(
    `SELECT telegram_id FROM browser_pod_tenants WHERE cdp_endpoint = $1`,
    [key]
  )
  return rows[0]?.telegram_id ? String(rows[0].telegram_id) : null
}

/**
 * The address of this person's own still-running pod, when the visit is over
 * but the browser is not. Null whenever that cannot be said for certain:
 * no configured pod, or a pod recorded to somebody else.
 */
export async function unclaimedPodOf(
  q: Queryable,
  telegramId: string,
  configuredCdp: string | undefined = process.env.BROWSER_POD_CDP
): Promise<string | null> {
  const cdp = (configuredCdp || '').trim()
  if (!cdp) return null
  const tenant = await podTenant(q, cdp)
  return tenant === telegramId ? cdp : null
}
