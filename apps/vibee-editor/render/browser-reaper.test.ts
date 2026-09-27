import { describe, it, expect } from 'vitest'
import {
  dueForReaping,
  sweepIdleSessions,
  IDLE_LIMIT_MS,
  MIN_AGE_MS,
  type ReapCandidate,
} from './src/browser/reaper'
import type { PodDriver } from './src/browser/pod-driver'
import type { Queryable } from './src/browser/sessions'

/**
 * THE REAPER DECIDES WHOSE BROWSER GOES OUT.
 *
 * Both directions hurt. Too eager and it closes a browser somebody is
 * looking at, mid-task, with their logins still in it. Too shy and a hundred
 * idle pods hold 74 GB of memory for nobody.
 */

const NOW = 1_800_000_000_000
const min = (n: number) => n * 60 * 1000

const row = (o: Partial<ReapCandidate> = {}): ReapCandidate => ({
  telegramId: 'tg-900000001',
  sessionId: 's1',
  podId: 'pod-s1',
  lastSeenMs: NOW - min(30),
  createdMs: NOW - min(60),
  ...o,
})

describe('who has gone quiet', () => {
  it('reaps a session nobody has watched for longer than the limit', () => {
    expect(dueForReaping([row()], NOW).map(r => r.sessionId)).toEqual(['s1'])
  })

  it('LEAVES ALONE a session somebody is watching right now', () => {
    expect(dueForReaping([row({ lastSeenMs: NOW - min(1) })], NOW)).toEqual([])
  })

  it('never reaps a session that is still coming up', () => {
    /*
     * A pod answers in about ten seconds and a person may take a minute to
     * look. Reaping in that window makes "open my browser" fail invisibly.
     *
     * THE SHORT LIMIT IS THE POINT. Under the default ten minutes the age
     * guard is invisible -- `max(lastSeen, created)` already saves a young
     * session -- and a mutation removing it survived this test until the
     * limit here was made shorter than the minimum age. That is exactly the
     * case the guard exists for: somebody tuning the limit down.
     */
    const young = row({ createdMs: NOW - 5_000, lastSeenMs: 0 })
    expect(dueForReaping([young], NOW, 1_000)).toEqual([])
    expect(dueForReaping([young], NOW)).toEqual([])
  })

  it('still reaps once a session is past the minimum age', () => {
    /* Negative control: the guard must not protect everything forever. */
    const older = row({ createdMs: NOW - MIN_AGE_MS - 1, lastSeenMs: 0 })
    expect(dueForReaping([older], NOW, 1_000)).toHaveLength(1)
  })

  it('measures an unused session from its birth, not from zero', () => {
    /* lastSeenMs = 0 is 1970: without this every new session is ancient. */
    const fresh = row({ createdMs: NOW - MIN_AGE_MS - 1000, lastSeenMs: 0 })
    expect(dueForReaping([fresh], NOW)).toEqual([])

    const old = row({ createdMs: NOW - min(30), lastSeenMs: 0 })
    expect(dueForReaping([old], NOW)).toHaveLength(1)
  })

  it('takes the limit it is given', () => {
    const r = row({ lastSeenMs: NOW - min(3) })
    expect(dueForReaping([r], NOW, min(10))).toEqual([])
    expect(dueForReaping([r], NOW, min(2))).toHaveLength(1)
  })

  it('has a limit measured in minutes, not seconds', () => {
    expect(IDLE_LIMIT_MS).toBeGreaterThanOrEqual(5 * 60 * 1000)
  })
})

function poolWith(rows: Array<Record<string, unknown>>) {
  const deleted: string[] = []
  /* In order, so a test can say what was written BEFORE the row went. */
  const order: string[] = []
  const pool: Queryable & { deleted: string[]; order: string[] } = {
    deleted,
    order,
    async query(sql, params = []) {
      const head = sql.trim().toUpperCase()
      if (head.startsWith('SELECT')) return { rows }
      if (head.startsWith('DELETE')) {
        deleted.push(String(params[0]))
        order.push(`delete:${params[0]}`)
        return { rows: [] }
      }
      if (head.startsWith('INSERT INTO BROWSER_POD_TENANTS')) {
        order.push(`tenant:${params[0]}=${params[1]}`)
        return { rows: [] }
      }
      return { rows: [] }
    },
  }
  return pool
}

const driverThat = (stop: PodDriver['stop']): PodDriver => ({
  name: 'fake',
  stop,
  async start() {
    throw new Error('not used')
  },
  async alive() {
    return true
  },
  async wipeProfile() {},
})

const dbRow = (o: Record<string, unknown> = {}) => ({
  telegram_id: 'tg-900000001',
  session_id: 's1',
  pod_id: 'pod-s1',
  last_seen_ms: NOW - min(30),
  created_ms: NOW - min(60),
  ...o,
})

describe('one sweep', () => {
  it('stops the pod and forgets the row', async () => {
    const stopped: string[] = []
    const pool = poolWith([dbRow()])
    const out = await sweepIdleSessions(
      pool,
      driverThat(async id => {
        stopped.push(id)
      }),
      NOW
    )
    expect(stopped).toEqual(['pod-s1'])
    expect(pool.deleted).toEqual(['tg-900000001'])
    expect(out.reaped).toEqual(['s1'])
  })

  it('KEEPS THE ROW when the pod refuses to stop', async () => {
    /*
     * Otherwise a running browser full of somebody's logins is left with
     * nothing able to name it, and no later pass can find it.
     */
    const pool = poolWith([dbRow()])
    const out = await sweepIdleSessions(
      pool,
      driverThat(async () => {
        throw new Error('platform is having a day')
      }),
      NOW
    )
    expect(pool.deleted).toEqual([])
    expect(out.failed).toEqual(['s1'])
    expect(out.reaped).toEqual([])
  })

  it('REMEMBERS WHOSE BROWSER IT IS BEFORE THE ROW GOES', async () => {
    /*
     * `driver.stop` is a no-op on this platform: the row goes, the browser
     * stays up with the person's accounts in it. Measured 2026-09-27 -- zero
     * rows, nine pages, 192 cookies -- and every "which of my networks are
     * connected?" answered "not connected". The tenant must be written while
     * the knowledge still exists, which is here, one statement before the
     * delete.
     */
    const pool = poolWith([dbRow({ cdp_endpoint: 'http://pod.internal:9223' })])
    await sweepIdleSessions(pool, driverThat(async () => {}), NOW)
    expect(pool.order).toEqual([
      'tenant:pod.internal:9223=tg-900000001',
      'delete:tg-900000001',
    ])
  })

  it('reaps a session with no bridge without inventing a tenant', async () => {
    const pool = poolWith([dbRow({ cdp_endpoint: null })])
    await sweepIdleSessions(pool, driverThat(async () => {}), NOW)
    expect(pool.order).toEqual(['delete:tg-900000001'])
  })

  it('touches nothing that is still in use', async () => {
    const stopped: string[] = []
    const pool = poolWith([dbRow({ last_seen_ms: NOW - min(1) })])
    const out = await sweepIdleSessions(
      pool,
      driverThat(async id => {
        stopped.push(id)
      }),
      NOW
    )
    expect(stopped).toEqual([])
    expect(pool.deleted).toEqual([])
    expect(out.looked).toBe(1)
  })
})
