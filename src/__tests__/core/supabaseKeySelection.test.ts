/**
 * Selection of the Supabase server key by JWT role, not by variable name.
 *
 * Witnessed 2026-09-13 on Railway production: `SUPABASE_SERVICE_KEY` carried an
 * anon JWT while `SUPABASE_SERVICE_ROLE_KEY` carried service_role. The old
 * name-first order picked anon, storage uploads hit RLS, and the welcome-avatar
 * Inngest event was never sent. These tests pin the role-first contract.
 */
import { describe, it, expect } from 'vitest'
import {
  selectSupabaseServiceKey,
  supabaseKeyRole,
} from '@/core/supabase/client'

function jwt(role: string): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase' })}.sig`
}

describe('supabaseKeyRole', () => {
  it('decodes role from a Supabase JWT', () => {
    expect(supabaseKeyRole(jwt('anon'))).toBe('anon')
    expect(supabaseKeyRole(jwt('service_role'))).toBe('service_role')
  })
  it('returns null for non-JWT or empty input', () => {
    expect(supabaseKeyRole('sb_secret_abc')).toBeNull()
    expect(supabaseKeyRole('')).toBeNull()
    expect(supabaseKeyRole(undefined)).toBeNull()
  })
})

describe('selectSupabaseServiceKey', () => {
  it('prefers the service_role JWT even when it lives in SUPABASE_SERVICE_KEY', () => {
    const picked = selectSupabaseServiceKey({
      SUPABASE_SERVICE_ROLE_KEY: jwt('anon'),
      SUPABASE_SERVICE_KEY: jwt('service_role'),
    })
    expect(picked?.source).toBe('SUPABASE_SERVICE_KEY')
    expect(picked?.role).toBe('service_role')
  })

  it('reproduces the production case: anon in SERVICE_KEY, service_role in SERVICE_ROLE_KEY', () => {
    const picked = selectSupabaseServiceKey({
      SUPABASE_SERVICE_KEY: jwt('anon'),
      SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
    })
    expect(picked?.source).toBe('SUPABASE_SERVICE_ROLE_KEY')
    expect(picked?.role).toBe('service_role')
  })

  it('falls back to SUPABASE_SERVICE_ROLE_KEY first when roles are undecodable', () => {
    const picked = selectSupabaseServiceKey({
      SUPABASE_SERVICE_KEY: 'sb_secret_a',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_b',
    })
    expect(picked?.source).toBe('SUPABASE_SERVICE_ROLE_KEY')
    expect(picked?.role).toBeNull()
  })

  it('uses the only key present and reports its role', () => {
    const picked = selectSupabaseServiceKey({ SUPABASE_SERVICE_KEY: jwt('anon') })
    expect(picked?.source).toBe('SUPABASE_SERVICE_KEY')
    expect(picked?.role).toBe('anon')
  })

  it('returns null when nothing is configured', () => {
    expect(selectSupabaseServiceKey({})).toBeNull()
  })
})
