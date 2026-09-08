import { beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pollRevocations } from './session-store'
import {
  setRevokedSessions,
  signAccessToken,
  verifyAppSession,
} from './session'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceFrom } = require('../../../scripts/lib/anchored-slice.cjs')

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

    /*
     * ПОДДЕЛКА ПОДЧИНЯЕТСЯ ЗАПРОСУ, А НЕ ОТДАЁТ СТРОКУ ВСЕГДА.
     *
     * Здесь стояло `query: async () => ({ rows: [{ id: … }] })` — отозванная
     * сессия возвращалась при ЛЮБОМ SQL. Доказано мутацией: заменить
     * `revoked_at IS NOT NULL` на `IS NULL` — и тест остаётся зелёным, хотя
     * в настоящем Postgres `NULL > timestamp` даёт NULL, запрос навсегда
     * возвращает ноль строк, и отозванный или разлогиненный токен продолжает
     * работать на каждой реплике.
     *
     * Теперь подделка ведёт себя как база: отдаёт строку, только если
     * условие действительно выбирает отозванные.
     */
    const pool = {
      query: async (sql: string) => {
        const т = String(sql).replace(/\s+/g, ' ')
        const отозванные =
          /revoked_at IS NOT NULL/.test(т) && /revoked_at >/.test(т)
        return {
          rows: отозванные ? [{ id: 'revoked-on-another-replica' }] : [],
        }
      },
    }
    expect(await pollRevocations(pool)).toBe(1)
    expect(() => verifyAppSession(token)).toThrow(/revoked/)
  })

  it('starts the initial sync before the HTTP listener and keeps polling', () => {
    const server = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    const main = sliceFrom(server, 'async function main()')
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
