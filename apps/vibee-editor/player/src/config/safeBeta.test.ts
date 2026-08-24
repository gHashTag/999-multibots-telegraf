import { describe, expect, it, vi } from 'vitest'
import {
  SAFE_BETA_CLIENT_CAPABILITIES,
  SAFE_BETA_CLIENT_LOCKED,
  SAFE_BETA_RENDER_QUOTA,
  isSafeBetaRouteEnabled,
} from './safeBeta'

describe('immutable SAFE BETA client capabilities', () => {
  it.each([
    { DEV: 'true', VITE_SAFE_BETA: 'false', VITE_ENABLE_PAID: 'true' },
    { DEV: 'false', VITE_SAFE_BETA: 'warn', VITE_ENABLE_RENDER: 'true' },
  ])('stays fail-closed under alternate runtime env %#', env => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)

    expect(SAFE_BETA_CLIENT_LOCKED).toBe(true)
    expect(SAFE_BETA_CLIENT_CAPABILITIES).toEqual({
      paid: false,
      generate: false,
      render: false,
      publish: false,
      charges: false,
      quotas: { total: 0, remaining: 0, free: 0 },
    })
    expect(SAFE_BETA_RENDER_QUOTA.total_renders).toBe(0)
    expect(SAFE_BETA_RENDER_QUOTA.free_remaining).toBe(0)
    expect(SAFE_BETA_RENDER_QUOTA.subscription).toBeNull()
    expect(Object.isFrozen(SAFE_BETA_CLIENT_CAPABILITIES)).toBe(true)
    expect(Object.isFrozen(SAFE_BETA_CLIENT_CAPABILITIES.quotas)).toBe(true)
    expect(Object.isFrozen(SAFE_BETA_RENDER_QUOTA)).toBe(true)

    expect(isSafeBetaRouteEnabled('/feed')).toBe(true)
    expect(isSafeBetaRouteEnabled('/chat')).toBe(true)
    expect(isSafeBetaRouteEnabled('/editor')).toBe(true)
    expect(isSafeBetaRouteEnabled('/generate/video')).toBe(false)
    expect(isSafeBetaRouteEnabled('/instagram/callback')).toBe(false)

    vi.unstubAllEnvs()
  })
})
