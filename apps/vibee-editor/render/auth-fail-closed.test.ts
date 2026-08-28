import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticate } from './auth'
import type { IncomingMessage } from 'node:http'

/**
 * A deployed instance must not be talked into letting requests through.
 *
 * WHY (#902). The mode used to be `(RENDER_AUTH_MODE || 'warn').toLowerCase()`
 * and every call site reads `allowed: mode() !== 'enforce'`. So the guard
 * opened for anything that was not the exact string 'enforce' — an unset
 * variable, a typo, a stray space. A configuration slip did not weaken
 * production, it opened it, and the only trace was one line in the startup log.
 *
 * Production is in fact set to enforce today — read from /health after the mode
 * was exposed there, not assumed — so this change cannot alter how production
 * behaves right now. It removes the way production could silently stop
 * enforcing later.
 *
 * On a laptop the variable still decides, so the warn-first rollout described
 * at auth.ts:20 keeps working where it was meant to.
 */

// No credentials, and not on the public list (auth.ts PUBLIC_*).
const protectedRequest = () =>
  ({
    url: '/render/some-job/status',
    method: 'GET',
    headers: {},
  }) as unknown as IncomingMessage

const KEYS = [
  'RENDER_AUTH_MODE',
  'RAILWAY_GIT_COMMIT_SHA',
  'RAILWAY_ENVIRONMENT',
] as const

describe('auth mode is fail-closed wherever it is deployed', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('deployed + RENDER_AUTH_MODE=warn still rejects a protected request', () => {
    // The acceptance criterion from #902, stated as a test: setting warn at
    // runtime in production must not reopen anything.
    process.env.RAILWAY_GIT_COMMIT_SHA = 'deadbee'
    process.env.RENDER_AUTH_MODE = 'warn'
    expect(authenticate(protectedRequest()).allowed).toBe(false)
  })

  it('deployed with no RENDER_AUTH_MODE at all rejects a protected request', () => {
    // The original defect: a missing variable meant 'warn', which meant open.
    process.env.RAILWAY_GIT_COMMIT_SHA = 'deadbee'
    expect(authenticate(protectedRequest()).allowed).toBe(false)
  })

  it('deployed with a misspelled mode rejects a protected request', () => {
    // `mode() !== 'enforce'` opened for every value that was not exactly
    // 'enforce', so a typo was indistinguishable from asking for warn.
    process.env.RAILWAY_ENVIRONMENT = 'production'
    process.env.RENDER_AUTH_MODE = 'enfroce'
    expect(authenticate(protectedRequest()).allowed).toBe(false)
  })

  it('not deployed and unset still warns rather than enforcing', () => {
    // A laptop keeps the old default, or the warn-first rollout would stop
    // being possible where it is actually useful.
    expect(authenticate(protectedRequest()).allowed).toBe(true)
  })

  it('not deployed but explicitly enforcing rejects a protected request', () => {
    process.env.RENDER_AUTH_MODE = 'enforce'
    expect(authenticate(protectedRequest()).allowed).toBe(false)
  })

  it('an unknown mode on a laptop falls back to warn, not to itself', () => {
    // Previously an unknown string was returned as-is and compared against
    // 'enforce', so it behaved as warn by accident rather than by decision.
    process.env.RENDER_AUTH_MODE = 'whatever'
    expect(authenticate(protectedRequest()).allowed).toBe(true)
  })
})
