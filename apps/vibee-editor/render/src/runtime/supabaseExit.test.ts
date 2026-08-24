import { describe, expect, it } from 'vitest'
import {
  assertSupabaseFreeRuntime,
  supabaseRuntimeViolations,
} from './supabaseExit'

describe('Supabase-free production runtime', () => {
  it('accepts a Railway PostgreSQL and S3-only production environment', () => {
    const env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://railway.internal/app',
      AWS_ENDPOINT_URL_S3: 'https://objects.example.invalid',
      S3_PUBLIC_URL: 'https://app.example.invalid/media',
    }

    expect(supabaseRuntimeViolations(env)).toEqual([])
    expect(() => assertSupabaseFreeRuntime(env)).not.toThrow()
  })

  it.each([
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASEURL',
    'SUPABASEKEY',
    'MY_SUPABASETOKEN',
    'VITE_SUPABASEURL',
  ])('fails closed when %s is present in production', key => {
    const env = { NODE_ENV: 'production', [key]: 'configured' }

    expect(() => assertSupabaseFreeRuntime(env)).toThrow(
      /Supabase runtime configuration is forbidden/
    )
  })

  it('cannot be disabled by relabelling the runtime as development', () => {
    expect(() =>
      assertSupabaseFreeRuntime({
        NODE_ENV: 'development',
        TELEGRAM_AUTH_ENV: 'development',
        SUPABASE_URL: 'configured',
      })
    ).toThrow(/Supabase runtime configuration is forbidden/)
  })

  it('rejects a Supabase host hidden in a differently named runtime URL', () => {
    const env = {
      NODE_ENV: 'production',
      S3_PUBLIC_URL:
        'https://project.supabase.invalid/storage/v1/object/public',
    }

    expect(supabaseRuntimeViolations(env)).toContain('S3_PUBLIC_URL:host')
    expect(() => assertSupabaseFreeRuntime(env)).toThrow()
  })

  it('does not expose environment values in the thrown error', () => {
    const secret = 'private-value-that-must-not-appear' // secret-guard-ok: synthetic redaction fixture

    let message = ''
    try {
      assertSupabaseFreeRuntime({
        NODE_ENV: 'production',
        SUPABASE_SERVICE_ROLE_KEY: secret,
      })
    } catch (error) {
      message = String(error)
    }

    expect(message).toContain('Supabase runtime configuration is forbidden')
    expect(message).not.toContain(secret)
  })
})
