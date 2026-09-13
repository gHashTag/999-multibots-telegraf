import { createClient, SupabaseClient } from '@supabase/supabase-js'

// 🔐 LAZY INITIALIZATION: клиенты создаются только при первом обращении
// Это позволяет Infisical загрузить секреты ПЕРЕД созданием клиентов
let _supabase: SupabaseClient | null = null
let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL
  if (!url) {
    console.error(
      '🚨 CRITICAL ERROR: SUPABASE_URL is undefined. Check Infisical configuration.'
    )
    console.error(
      'Available env keys:',
      Object.keys(process.env).filter(k => k.includes('SUPABASE'))
    )
    throw new Error(
      'SUPABASE_URL is required but undefined. Ensure Infisical loaded secrets before accessing Supabase.'
    )
  }
  return url
}

/**
 * Role carried by a Supabase JWT (`anon` / `service_role`), or null when the
 * value is not a JWT. The secret itself is never logged, only the role.
 */
export function supabaseKeyRole(key: string | undefined): string | null {
  if (!key) return null
  const parts = key.split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(
      Buffer.from(
        parts[1].replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString('utf8')
    )
    return typeof payload?.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

/**
 * Picks the key for the server-side client by the role inside the JWT, not by
 * the variable name.
 *
 * WHY. On Railway production (checked by decoding the JWT on 2026-09-13)
 * `SUPABASE_SERVICE_KEY` held an anon key while `SUPABASE_SERVICE_ROLE_KEY`
 * held service_role; the old code took `SUPABASE_SERVICE_KEY` first. Under the
 * anon role storage.upload failed with `new row violates row-level security
 * policy`, avatar mirroring returned null, and the `welcome-avatar-generate`
 * Inngest event was not sent once in 7 days of logs.
 */
export function selectSupabaseServiceKey(env: {
  SUPABASE_SERVICE_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}): { key: string; role: string | null; source: string } | null {
  const candidates: Array<[string, string | undefined]> = [
    ['SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY],
    ['SUPABASE_SERVICE_KEY', env.SUPABASE_SERVICE_KEY],
  ]
  const present = candidates.filter(([, v]) => !!v) as Array<[string, string]>
  if (present.length === 0) return null
  const service = present.find(([, v]) => supabaseKeyRole(v) === 'service_role')
  const [source, key] = service ?? present[0]
  return { key, role: supabaseKeyRole(key), source }
}

let keyRoleWarned = false

function getSupabaseKey(): string {
  const picked = selectSupabaseServiceKey({
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  if (!picked) {
    console.error(
      '🚨 CRITICAL ERROR: Neither SUPABASE_SERVICE_KEY nor SUPABASE_SERVICE_ROLE_KEY is defined'
    )
    throw new Error(
      'Supabase service key is required but undefined. Ensure Infisical loaded secrets.'
    )
  }

  if (picked.role !== 'service_role' && !keyRoleWarned) {
    keyRoleWarned = true
    console.warn(
      `⚠️ [SUPABASE] Server client uses key from ${picked.source} with role "${picked.role ?? 'unknown'}" (not service_role): RLS will block storage uploads and privileged writes`
    )
  }

  return picked.key
}

// Lazy-initialized Supabase client
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    if (!_supabase) {
      _supabase = createClient(getSupabaseUrl(), getSupabaseKey())
    }
    return (_supabase as any)[prop]
  },
})

// Lazy-initialized Supabase Admin client
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    if (!_supabaseAdmin) {
      const url = getSupabaseUrl()
      _supabaseAdmin = createClient(url, getSupabaseKey())
    }
    return (_supabaseAdmin as any)[prop]
  },
})
