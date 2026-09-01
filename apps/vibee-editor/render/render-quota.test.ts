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
    await reserveRenderQuota(pool, '42', false)
    await refundRenderQuota(pool, '42', false)
    expect((await readRenderQuota(pool, '42', false)).total_renders).toBe(0)
  })

  it('keeps the verified owner unlimited without mutating usage', async () => {
    const pool = fakePool()
    expect(await reserveRenderQuota(pool, '42', true)).toEqual({
      allowed: true,
      used: 0,
    })
    expect(pool.used).toBe(0)
  })
})
