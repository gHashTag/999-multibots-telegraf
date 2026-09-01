import { describe, it, expect, beforeEach } from 'vitest'
import { issuePairingCode, claimPairingCode, PAIRING } from './session-store'

/**
 * A Postgres stand-in small enough to reason about.
 *
 * WHY NOT A REAL DATABASE. Every guard in `claimPairingCode` is written as a
 * WHERE clause precisely so the database enforces it under concurrency. A fake
 * cannot prove that. What it CAN prove is the thing that actually broke twice
 * in this file's neighbourhood: that the code paths call the right statements
 * in the right order and return the right shape.
 *
 * So this fake implements the four statements literally — including the
 * `consumed_at IS NULL` and `expires_at > now()` filters — and any statement it
 * does not recognise THROWS rather than silently returning no rows. A fake that
 * answers "0 rows" to a query it did not understand turns a broken test into a
 * passing one, which is worse than having no test.
 */
class FakePool {
  rows: {
    code_hash: string
    telegram_id: string
    expires_at: number
    consumed_at: number | null
    attempts: number
  }[] = []

  now = Date.now()

  async connect() {
    return {
      query: this.query.bind(this),
      release() {},
    }
  }

  async query(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
    const s = sql.replace(/\s+/g, ' ').trim()

    if (s.startsWith('CREATE TABLE')) return { rows: [] }
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] }
    if (s.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] }

    if (
      s.includes(
        'UPDATE app_pairing_codes SET consumed_at = now() WHERE telegram_id'
      )
    ) {
      for (const r of this.rows) {
        if (r.telegram_id === params[0] && r.consumed_at === null)
          r.consumed_at = this.now
      }
      return { rows: [] }
    }

    if (s.startsWith('INSERT INTO app_pairing_codes')) {
      this.rows.push({
        code_hash: String(params[0]),
        telegram_id: String(params[1]),
        expires_at: Date.parse(String(params[2])),
        consumed_at: null,
        attempts: 0,
      })
      return { rows: [] }
    }

    if (s.startsWith('SELECT telegram_id, expires_at, consumed_at, attempts')) {
      const hit = this.rows.filter(r => r.code_hash === params[0])
      return { rows: hit }
    }

    if (s.includes('SET attempts = attempts + 1')) {
      for (const r of this.rows) {
        if (r.consumed_at === null && r.expires_at > this.now) r.attempts++
      }
      return { rows: [] }
    }

    if (
      s.includes(
        'SET consumed_at = now() WHERE consumed_at IS NULL AND attempts >='
      )
    ) {
      for (const r of this.rows) {
        if (r.consumed_at === null && r.attempts >= Number(params[0]))
          r.consumed_at = this.now
      }
      return { rows: [] }
    }

    if (s.includes('SET consumed_at = now() WHERE code_hash')) {
      const out: any[] = []
      for (const r of this.rows) {
        if (
          r.code_hash === params[0] &&
          r.consumed_at === null &&
          r.expires_at > this.now
        ) {
          r.consumed_at = this.now
          out.push({ telegram_id: r.telegram_id })
        }
      }
      return { rows: out }
    }

    throw new Error(`FakePool: неизвестный запрос: ${s.slice(0, 80)}`)
  }
}

describe('спаривание по коду', () => {
  let pool: FakePool
  beforeEach(() => {
    pool = new FakePool()
  })

  const выдать = (id: string, код: string) =>
    issuePairingCode(pool as any, id, () => код)

  it('код обменивается на тот telegram_id, которому выдан', async () => {
    await выдать('4242', '123456')
    const r = await claimPairingCode(pool as any, '123456')
    expect(r).toEqual({ ok: true, telegramId: '4242' })
  })

  it('второй обмен тем же кодом не проходит', async () => {
    await выдать('4242', '123456')
    await claimPairingCode(pool as any, '123456')
    const второй = await claimPairingCode(pool as any, '123456')
    expect(второй).toEqual({ ok: false, reason: 'expired' })
  })

  it('сырой код нигде не хранится — только его отпечаток', async () => {
    await выдать('4242', '123456')
    expect(JSON.stringify(pool.rows)).not.toContain('123456')
  })

  it('повторная выдача гасит прошлый код: живым остаётся ровно один', async () => {
    await выдать('4242', '111111')
    await выдать('4242', '222222')

    expect(await claimPairingCode(pool as any, '111111')).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(await claimPairingCode(pool as any, '222222')).toEqual({
      ok: true,
      telegramId: '4242',
    })
  })

  it('истёкший код не принимается', async () => {
    await выдать('4242', '123456')
    pool.now += (PAIRING.TTL_SECONDS + 1) * 1000
    expect(await claimPairingCode(pool as any, '123456')).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('чужой код не выдаёт чужую личность', async () => {
    await выдать('4242', '111111')
    expect(await claimPairingCode(pool as any, '999999')).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('неверные догадки не меняют живой код другого человека', async () => {
    await issuePairingCode(pool as any, '1111', () => '123456')
    await issuePairingCode(pool as any, '2222', () => '222222')
    for (let i = 0; i < PAIRING.MAX_ATTEMPTS - 1; i++) {
      await claimPairingCode(pool as any, '000000')
    }
    expect(await claimPairingCode(pool as any, '123456')).toEqual({
      ok: true,
      telegramId: '1111',
    })
    expect(await claimPairingCode(pool as any, '222222')).toEqual({
      ok: true,
      telegramId: '2222',
    })
  })

  it('коды разных людей не смешиваются', async () => {
    await выдать('1111', '111111')
    await выдать('2222', '222222')
    expect(await claimPairingCode(pool as any, '222222')).toEqual({
      ok: true,
      telegramId: '2222',
    })
  })

  it('два одновременных старта оставляют владельцу ровно один живой код', async () => {
    const race = new ConcurrentIssuePool()
    await Promise.all([
      issuePairingCode(race as any, '4242', () => '111111'),
      issuePairingCode(race as any, '4242', () => '222222'),
    ])

    expect(
      race.rows.filter(row => row.telegram_id === '4242' && !row.consumed_at)
    ).toHaveLength(1)
  })
})

class ConcurrentIssuePool extends FakePool {
  private updateArrivals = 0
  private releaseUpdates: (() => void) | null = null
  private updatesReady = new Promise<void>(resolve => {
    this.releaseUpdates = resolve
  })
  private transactionTail = Promise.resolve()

  override async query(sql: string, params: unknown[] = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    if (
      normalized.includes(
        'UPDATE app_pairing_codes SET consumed_at = now() WHERE telegram_id'
      )
    ) {
      this.updateArrivals += 1
      if (this.updateArrivals === 2) this.releaseUpdates?.()
      await this.updatesReady
    }
    return super.query(sql, params)
  }

  override async connect() {
    let unlock: (() => void) | null = null
    return {
      query: async (sql: string, params: unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim()
        if (normalized.startsWith('SELECT pg_advisory_xact_lock')) {
          const previous = this.transactionTail
          this.transactionTail = new Promise<void>(resolve => {
            unlock = resolve
          })
          await previous
          return { rows: [] }
        }
        if (normalized === 'COMMIT' || normalized === 'ROLLBACK') {
          const result = await FakePool.prototype.query.call(this, sql, params)
          unlock?.()
          return result
        }
        return FakePool.prototype.query.call(this, sql, params)
      },
      release() {
        unlock?.()
      },
    }
  }
}
