/**
 * Shared plumbing for the wallet scripts.
 *
 * Every trap encoded here already cost us something once.
 */

/**
 * PostgREST returns at most 1000 rows whatever `limit=` says. A plain query
 * against a 17000-row ledger therefore looks complete and is not. Always page.
 */
export async function paged<T>(
  base: string,
  key: string,
  path: string
): Promise<T[]> {
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
      headers: { ...headers, Range: `${from}-${from + 999}` },
    })
    const body = await res.text()
    if (!res.ok) throw new Error(`read failed HTTP ${res.status}: ${body}`)
    const rows = JSON.parse(body)
    if (!Array.isArray(rows) || rows.length === 0) break
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

/**
 * Refuse to run under the anon key.
 *
 * `SUPABASE_SERVICE_KEY` holds a role=anon token on Railway, while
 * `SUPABASE_SERVICE_ROLE_KEY` holds the real one. Reads succeed under anon, so
 * a dry run looks perfect and the write then dies on RLS — or worse, an empty
 * result reads as "nobody qualifies". Decode the claim instead of trusting the
 * variable's name.
 */
export function assertServiceRole(key: string | undefined): void {
  let role: string | undefined
  try {
    role = JSON.parse(
      Buffer.from((key ?? '').split('.')[1] ?? '', 'base64url').toString()
    ).role
  } catch {
    role = undefined
  }
  if (role !== 'service_role') {
    throw new Error(
      `Refusing to run: Supabase key role is "${role ?? 'undecodable'}", not service_role.`
    )
  }
}

/** Env the wallet scripts need, read once and checked loudly. */
export function walletEnv(): {
  supabaseUrl: string
  supabaseKey: string
  renderDb: string
} {
  const supabaseUrl = process.env.SUPABASE_URL ?? ''
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  // Deliberately NOT `DATABASE_URL`. A developer shell commonly has that
  // pointing at a local Postgres -- ours did -- and a money script that picks
  // it up reconciles against an empty database and reports that all is well.
  // The live wallet gets its own name, and a local host is refused outright.
  //
  // The value is the public proxy from Railway's Postgres service
  // (`DATABASE_PUBLIC_URL`); vibee-render's own `DATABASE_URL` is the internal
  // host and fails with ENOTFOUND from a laptop.
  const renderDb = process.env.RENDER_DATABASE_URL ?? ''
  if (!supabaseUrl) throw new Error('SUPABASE_URL missing')
  assertServiceRole(supabaseKey)
  if (renderDb) {
    const host = new URL(renderDb).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      throw new Error(
        `Refusing to run: RENDER_DATABASE_URL points at ${host}. The live wallet is not on this machine.`
      )
    }
  }
  return { supabaseUrl, supabaseKey, renderDb }
}

/** Scripts that move money run read-only unless told otherwise, explicitly. */
export const isCommit = (): boolean => process.argv.includes('--commit')

export function banner(commit: boolean): void {
  console.log(commit ? '\n=== LIVE WRITE ===' : '\n=== DRY RUN (no --commit) ===')
}
