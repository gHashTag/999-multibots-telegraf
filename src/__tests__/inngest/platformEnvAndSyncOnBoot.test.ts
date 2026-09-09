/**
 * Platform env precedence over Infisical + Inngest sync-on-boot.
 * Pure units, no network, no Infisical SDK.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  PLATFORM_ENV_PRECEDENCE,
  applySecretsToEnv,
} from '@/core/infisical/platformEnv'
import {
  shouldSyncOnBoot,
  syncInngestAppOnBoot,
} from '@/inngest_app/status/syncOnBoot'

describe('PLATFORM_ENV_PRECEDENCE', () => {
  it('lists the topology keys that Railway/Fly own', () => {
    for (const key of [
      'INNGEST_SERVE_ORIGIN',
      'BASE_WEBHOOK_URL',
      'INNGEST_BASE_URL',
      'INNGEST_GQL_URL',
    ]) {
      expect(PLATFORM_ENV_PRECEDENCE.has(key)).toBe(true)
    }
    // Secrets are NOT platform-owned — Infisical must still win for them.
    expect(PLATFORM_ENV_PRECEDENCE.has('INNGEST_EVENT_KEY')).toBe(false)
    expect(PLATFORM_ENV_PRECEDENCE.has('INNGEST_SIGNING_KEY')).toBe(false)
  })
})

describe('applySecretsToEnv', () => {
  const secrets = [
    { secretKey: 'INNGEST_BASE_URL', secretValue: 'https://public.example/v0' },
    { secretKey: 'INNGEST_GQL_URL', secretValue: 'https://public.example/v0/gql' },
    { secretKey: 'INNGEST_EVENT_KEY', secretValue: 'evt-from-infisical' },
    { secretKey: 'SOME_OTHER', secretValue: 'x' },
  ]

  it('keeps platform-owned keys already set in env, applies the rest', () => {
    const env: Record<string, string | undefined> = {
      INNGEST_BASE_URL: 'http://inngest.railway.internal:8288',
      INNGEST_EVENT_KEY: 'evt-from-platform',
    }
    const r = applySecretsToEnv(secrets, env)
    expect(env.INNGEST_BASE_URL).toBe('http://inngest.railway.internal:8288')
    // Not in precedence list → Infisical overrides, as before.
    expect(env.INNGEST_EVENT_KEY).toBe('evt-from-infisical')
    // Platform did not set it → Infisical applies (no regression).
    expect(env.INNGEST_GQL_URL).toBe('https://public.example/v0/gql')
    expect(env.SOME_OTHER).toBe('x')
    expect(r.preserved).toEqual(['INNGEST_BASE_URL'])
    expect(r.applied.sort()).toEqual(
      ['INNGEST_EVENT_KEY', 'INNGEST_GQL_URL', 'SOME_OTHER'].sort()
    )
  })

  it('treats an empty platform value as unset', () => {
    const env: Record<string, string | undefined> = { INNGEST_BASE_URL: '' }
    applySecretsToEnv(secrets, env)
    expect(env.INNGEST_BASE_URL).toBe('https://public.example/v0')
  })
})

describe('shouldSyncOnBoot', () => {
  it('requires INNGEST_SERVE_ORIGIN and honours the kill switch', () => {
    expect(shouldSyncOnBoot({} as NodeJS.ProcessEnv).sync).toBe(false)
    expect(
      shouldSyncOnBoot({ INNGEST_SERVE_ORIGIN: 'https://a' } as NodeJS.ProcessEnv)
        .sync
    ).toBe(true)
    expect(
      shouldSyncOnBoot({
        INNGEST_SERVE_ORIGIN: 'https://a',
        INNGEST_SYNC_ON_BOOT: '0',
      } as NodeJS.ProcessEnv).sync
    ).toBe(false)
    expect(
      shouldSyncOnBoot({
        INNGEST_SERVE_ORIGIN: 'https://a',
        NODE_ENV: 'test',
      } as NodeJS.ProcessEnv).sync
    ).toBe(false)
  })
})

describe('syncInngestAppOnBoot', () => {
  const env = { INNGEST_SERVE_ORIGIN: 'https://app.example' } as NodeJS.ProcessEnv
  const noSleep = async () => undefined

  it('PUTs the loopback serve URL and reports success', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      text: async () => '{"message":"Successfully registered","modified":true}',
    }))
    const r = await syncInngestAppOnBoot({
      port: 3000,
      env,
      fetchImpl,
      sleep: noSleep,
      delayMs: 0,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, any]
    expect(url).toBe('http://127.0.0.1:3000/api/inngest')
    expect(init.method).toBe('PUT')
    expect(r.ok).toBe(true)
    expect(r.attempts).toBe(1)
    expect(r.body).toContain('Successfully registered')
  })

  it('retries on non-2xx and gives up after N attempts without throwing', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 503, text: async () => 'down' }))
    const r = await syncInngestAppOnBoot({
      port: '4000',
      env,
      fetchImpl,
      sleep: noSleep,
      delayMs: 0,
      attempts: 3,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(r.ok).toBe(false)
    expect(r.status).toBe(503)
    expect(r.attempts).toBe(3)
  })

  it('does nothing when gated off', async () => {
    const fetchImpl = vi.fn()
    const r = await syncInngestAppOnBoot({
      port: 3000,
      env: { ...env, INNGEST_SYNC_ON_BOOT: '0' } as NodeJS.ProcessEnv,
      fetchImpl,
      sleep: noSleep,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(r.skipped).toBe(true)
  })
})
