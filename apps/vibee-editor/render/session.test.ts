import { describe, it, expect, beforeEach } from 'vitest'
import {
  signAccessToken,
  verifyAppSession,
  SessionError,
  setRevokedSessions,
  issueRefreshToken,
  rotateRefreshToken,
  digest,
} from './session'

/**
 * These tests exist because the module is full of confident prose, and prose
 * is not evidence. Each one deletes an assumption: that the signature is
 * checked, that `alg` cannot be negotiated, that a reused refresh token burns
 * the whole family rather than just itself.
 */

const KEY = 'test-key-that-is-definitely-long-enough-0123456789'

beforeEach(() => {
  process.env.SESSION_SIGNING_KEY = KEY
  setRevokedSessions([])
})

const mint = (over: Partial<Parameters<typeof signAccessToken>[0]> = {}) =>
  signAccessToken({
    telegramId: '144022504',
    sessionId: 'sess-1',
    deviceKeyThumbprint: 'dk-1',
    ...over,
  })

describe('access token', () => {
  it('round-trips the identity it was given', () => {
    const claims = verifyAppSession(mint())
    expect(claims.sub).toBe('144022504')
    expect(claims.sid).toBe('sess-1')
    expect(claims.dkt).toBe('dk-1')
  })

  it('rejects a tampered payload', () => {
    const [h, b, s] = mint().split('.')
    const forged = JSON.parse(Buffer.from(b, 'base64url').toString())
    forged.sub = '999999'
    const swapped = Buffer.from(JSON.stringify(forged)).toString('base64url')
    expect(() => verifyAppSession(`${h}.${swapped}.${s}`)).toThrow(SessionError)
  })

  it('refuses alg:none', () => {
    // The classic. A header claiming no algorithm, with an empty signature.
    const claims = Buffer.from(
      JSON.stringify({ sub: 'x', sid: 'y', dkt: 'z', jti: 'j', iat: 1, exp: 9e9, v: 1 })
    ).toString('base64url')
    const head = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    expect(() => verifyAppSession(`${head}.${claims}.`)).toThrow(/algorithm none refused/)
  })

  it('refuses a key-resolution header', () => {
    // `kid` invites the verifier to fetch a key of the attacker's choosing.
    const head = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'https://evil/key' })
    ).toString('base64url')
    const [, b, s] = mint().split('.')
    expect(() => verifyAppSession(`${head}.${b}.${s}`)).toThrow(/key-resolution/)
  })

  it('rejects an expired token, and honours clock skew', () => {
    // Один и тот же момент для чеканки и проверки: иначе тест сравнивает
    // токен из реального «сейчас» с вымышленной эпохой и падает на «выдан
    // в будущем», ничего не сказав про срок годности.
    const now = 1_800_000_000
    const t = mint({ now })
    // Inside the skew window: still good.
    expect(() => verifyAppSession(t, now + 600 + 30)).not.toThrow()
    // Past it: refused.
    expect(() => verifyAppSession(t, now + 600 + 3600)).toThrow(/expired/)
  })

  it('rejects a revoked session even though the signature is valid', () => {
    const t = mint()
    expect(() => verifyAppSession(t)).not.toThrow()
    setRevokedSessions(['sess-1'])
    expect(() => verifyAppSession(t)).toThrow(/revoked/)
  })

  it('refuses to sign without a real key', () => {
    process.env.SESSION_SIGNING_KEY = 'short'
    expect(() => mint()).toThrow(/SESSION_SIGNING_KEY/)
  })
})

describe('refresh rotation', () => {
  interface Row {
    familyId: string
    usedAt: Date | null
    revokedAt: Date | null
    expiresAt: Date
  }

  function makeStore() {
    const rows = new Map<string, Row>()
    const sessionsOf = new Map<string, string[]>()
    return {
      rows,
      sessionsOf,
      async find(h: string) {
        return rows.get(h) ?? null
      },
      async markUsed(h: string) {
        const r = rows.get(h)
        if (r) r.usedAt = new Date()
      },
      async revokeFamily(f: string) {
        for (const r of rows.values()) if (r.familyId === f) r.revokedAt = new Date()
        return sessionsOf.get(f) ?? []
      },
      async insert(h: string, f: string, exp: Date) {
        rows.set(h, { familyId: f, usedAt: null, revokedAt: null, expiresAt: exp })
      },
    }
  }

  it('stores only the hash, never the token', () => {
    const issued = issueRefreshToken()
    expect(issued.hash).toBe(digest(issued.token))
    expect(issued.hash).not.toBe(issued.token)
  })

  it('rotates once and refuses the old token afterwards', async () => {
    const store = makeStore()
    const first = issueRefreshToken()
    await store.insert(first.hash, 'fam-1', first.expiresAt)

    const r1 = await rotateRefreshToken(first.token, store)
    expect(r1.ok).toBe(true)

    // The same token again — this is the theft signal.
    const r2 = await rotateRefreshToken(first.token, store)
    expect(r2).toMatchObject({ ok: false, reason: 'reused' })
  })

  it('reuse revokes the WHOLE family, not just the presented token', async () => {
    const store = makeStore()
    const first = issueRefreshToken()
    await store.insert(first.hash, 'fam-1', first.expiresAt)
    store.sessionsOf.set('fam-1', ['sess-a', 'sess-b'])

    const r1 = await rotateRefreshToken(first.token, store)
    expect(r1.ok).toBe(true)
    const second = (r1 as { ok: true; next: { token: string } }).next.token

    await rotateRefreshToken(first.token, store)

    // The descendant is dead too — that is the point of family revocation.
    const r3 = await rotateRefreshToken(second, store)
    expect(r3).toMatchObject({ ok: false, reason: 'revoked' })

    // And the sessions it minted are refused without waiting for a poll.
    process.env.SESSION_SIGNING_KEY = KEY
    const t = signAccessToken({
      telegramId: '1', sessionId: 'sess-a', deviceKeyThumbprint: 'd',
    })
    expect(() => verifyAppSession(t)).toThrow(/revoked/)
  })

  it('refuses an expired refresh token', async () => {
    const store = makeStore()
    const old = issueRefreshToken(new Date(Date.now() - 90 * 24 * 3600 * 1000))
    await store.insert(old.hash, 'fam-1', old.expiresAt)
    expect(await rotateRefreshToken(old.token, store)).toMatchObject({
      ok: false, reason: 'expired',
    })
  })

  it('refuses a token it has never seen', async () => {
    expect(await rotateRefreshToken('made-up', makeStore())).toMatchObject({
      ok: false, reason: 'unknown',
    })
  })
})
