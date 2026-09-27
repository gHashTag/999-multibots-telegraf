/**
 * The one fact the session row cannot keep: whose accounts are on the pod
 * after the visit's row is deleted. Checked against a fake table, because the
 * bug it fixes was a correct query asking the wrong question.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  bareEndpoint,
  podTenant,
  rememberPodTenant,
  resetPodTenantsCache,
  unclaimedPodOf,
} from './pod-tenant'

/** Enough Postgres to hold one keyed fact. */
function fakePool() {
  const rows = new Map<string, string>()
  return {
    rows,
    query: async (sql: string, params: unknown[] = []) => {
      if (/CREATE TABLE/i.test(sql)) return { rows: [] }
      if (/^INSERT/i.test(sql)) {
        rows.set(String(params[0]), String(params[1]))
        return { rows: [] }
      }
      if (/^SELECT/i.test(sql)) {
        const found = rows.get(String(params[0]))
        return { rows: found ? [{ telegram_id: found }] : [] }
      }
      throw new Error(`unexpected sql: ${sql}`)
    },
  }
}

beforeEach(resetPodTenantsCache)

describe('bareEndpoint', () => {
  it('reads one pod written three ways as one pod', () => {
    expect(bareEndpoint('http://Pod.internal:9223/')).toBe('pod.internal:9223')
    expect(bareEndpoint('pod.internal:9223')).toBe('pod.internal:9223')
    expect(bareEndpoint('  POD.internal:9223  ')).toBe('pod.internal:9223')
  })

  it('is empty for nothing, so an unset address is never a key', () => {
    expect(bareEndpoint('   ')).toBe('')
  })
})

describe('rememberPodTenant', () => {
  it('remembers who is on the pod, and finds it written with a scheme', async () => {
    const pool = fakePool()
    await rememberPodTenant(pool as never, 'pod.internal:9223', '144022504')
    expect(await podTenant(pool as never, 'http://pod.internal:9223/')).toBe(
      '144022504'
    )
  })

  it('lets the newest session win, because that is the profile now mounted', async () => {
    const pool = fakePool()
    await rememberPodTenant(pool as never, 'pod:9223', 'first')
    await rememberPodTenant(pool as never, 'pod:9223', 'second')
    expect(await podTenant(pool as never, 'pod:9223')).toBe('second')
  })

  it('writes nothing for a pod with no address', async () => {
    const pool = fakePool()
    await rememberPodTenant(pool as never, '  ', '144022504')
    expect(pool.rows.size).toBe(0)
  })
})

describe('unclaimedPodOf', () => {
  it('gives the person their own still-running pod', async () => {
    const pool = fakePool()
    await rememberPodTenant(pool as never, 'pod:9223', '144022504')
    expect(await unclaimedPodOf(pool as never, '144022504', 'pod:9223')).toBe(
      'pod:9223'
    )
  })

  it('never gives one person the pod another person is recorded on', async () => {
    const pool = fakePool()
    await rememberPodTenant(pool as never, 'pod:9223', '144022504')
    expect(
      await unclaimedPodOf(pool as never, '999999999', 'pod:9223')
    ).toBeNull()
  })

  it('says nothing on a deployment that starts a pod per session', async () => {
    const pool = fakePool()
    await rememberPodTenant(pool as never, 'pod:9223', '144022504')
    expect(await unclaimedPodOf(pool as never, '144022504', '')).toBeNull()
  })

  it('says nothing about a configured pod nobody was ever recorded on', async () => {
    const pool = fakePool()
    expect(
      await unclaimedPodOf(pool as never, '144022504', 'fresh:9223')
    ).toBeNull()
  })
})
