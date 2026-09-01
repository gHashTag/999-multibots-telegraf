import { beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pollRevocations } from './session-store'
import {
  setRevokedSessions,
  signAccessToken,
  verifyAppSession,
} from './session'

const KEY = 'test-signing-key-long-enough-for-the-check-0123456789'

describe('cross-replica session revocation', () => {
  beforeEach(() => {
    process.env.SESSION_SIGNING_KEY = KEY
    setRevokedSessions([])
  })

  it('loads database revocations into the synchronous verifier', async () => {
    const token = signAccessToken({
      telegramId: '42',
      sessionId: 'revoked-on-another-replica',
      deviceKeyThumbprint: 'device',
    })
    expect(() => verifyAppSession(token)).not.toThrow()

    const pool = {
      query: async () => ({ rows: [{ id: 'revoked-on-another-replica' }] }),
    }
    expect(await pollRevocations(pool)).toBe(1)
    expect(() => verifyAppSession(token)).toThrow(/revoked/)
  })

  it('starts the initial sync before the HTTP listener and keeps polling', () => {
    const server = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    const main = server.slice(server.indexOf('async function main()'))
    expect(main.indexOf('await startSessionRevocationSync()')).toBeGreaterThan(
      -1
    )
    expect(main.indexOf('await startSessionRevocationSync()')).toBeLessThan(
      main.indexOf('server.listen(')
    )
    expect(server).toContain('await pollRevocations(pool)')
    expect(server).toContain('setInterval(() =>')
    expect(server).toContain(
      'SESSION_SIGNING_KEY is required for deployed browser authentication'
    )
    expect(server.indexOf('signingKey.length < 32')).toBeGreaterThan(-1)
  })

  it('fails closed when the database-backed revocation view goes stale', () => {
    const now = Date.now()
    const clock = Math.floor(now / 1000)
    const token = signAccessToken({
      telegramId: '42',
      sessionId: 'still-signed',
      deviceKeyThumbprint: 'device',
      now: clock,
    })
    expect(() => verifyAppSession(token, clock)).not.toThrow()

    const realNow = Date.now
    Date.now = () => now + 16_000
    try {
      expect(() => verifyAppSession(token, clock + 16)).toThrow(
        /revocation state is unavailable/
      )
    } finally {
      Date.now = realNow
    }
  })
})
