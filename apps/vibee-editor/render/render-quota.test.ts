import { describe, expect, it } from 'vitest'
import {
  FREE_RENDER_LIMIT,
  readRenderQuota,
  refundRenderQuota,
  reserveRenderQuota,
} from './render-quota'

function fakePool() {
  let used = 0
  return {
    get used() {
      return used
    },
    async query(sql: string) {
      if (sql.includes('CREATE TABLE')) return { rows: [] }
      if (sql.includes('SELECT used_count'))
        return { rows: [{ used_count: used }] }
      if (sql.includes('INSERT INTO app_render_quota')) {
        if (used >= FREE_RENDER_LIMIT) return { rows: [] }
        used += 1
        return { rows: [{ used_count: used }] }
      }
      if (sql.includes('GREATEST')) {
        used = Math.max(0, used - 1)
        return { rows: [] }
      }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  }
}

describe('authoritative render quota', () => {
  it('reserves atomically up to the configured free limit', async () => {
    const pool = fakePool()
    const outcomes = []
    for (let i = 0; i < FREE_RENDER_LIMIT + 1; i += 1) {
      outcomes.push(await reserveRenderQuota(pool, '42', false))
    }
    expect(outcomes.filter(result => result.allowed)).toHaveLength(
      FREE_RENDER_LIMIT
    )
    expect(outcomes.at(-1)?.allowed).toBe(false)
  })

  it('refunds a failed render and reports the server count', async () => {
    const pool = fakePool()
    const reservation = await reserveRenderQuota(pool, '42', false)
    await refundRenderQuota(pool, '42', false, reservation.periodStart)
    expect((await readRenderQuota(pool, '42', false)).total_renders).toBe(0)
  })

  it('keeps the verified owner unlimited without mutating usage', async () => {
    const pool = fakePool()
    expect(await reserveRenderQuota(pool, '42', true)).toEqual({
      allowed: true,
      used: 0,
      periodStart: null,
    })
    expect(pool.used).toBe(0)
  })

  it('refunds the exact reserved month after a UTC rollover', async () => {
    const calls: unknown[][] = []
    const pool = {
      async query(sql: string, params: unknown[] = []) {
        calls.push(params)
        if (sql.includes('CREATE TABLE')) return { rows: [] }
        if (sql.includes('INSERT INTO app_render_quota')) {
          return { rows: [{ used_count: 1 }] }
        }
        if (sql.includes('GREATEST')) return { rows: [] }
        throw new Error(`unexpected SQL: ${sql}`)
      },
    }
    const reservation = await reserveRenderQuota(
      pool,
      '42',
      false,
      new Date('2026-08-31T23:59:59.000Z')
    )
    await refundRenderQuota(pool, '42', false, reservation.periodStart)
    expect(calls.at(-1)?.[1]).toBe('2026-08-01')
  })
})
