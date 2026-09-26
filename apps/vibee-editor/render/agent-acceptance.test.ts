import { beforeEach, describe, expect, it } from 'vitest'
import {
  handleAcceptance,
  resetAcceptanceTableForTests,
  STREAK_DAYS,
  streakOf,
  verdictOf,
  type AcceptanceDeps,
} from './src/agent/agent-acceptance'

/**
 * THE MARKET SHOWS WHAT WAS MEASURED, NOT WHAT WAS PROMISED.
 *
 * Each case is a way this could lie or leak: a stranger writing "pass" for
 * an agent, the canary's answer text reaching a public card, a failure
 * stored as prose, or an unreadable table read as "never checked".
 */

const KEEPER = '144022504'

/** A pool double that keeps inserted rows and answers the latest per agent. */
const fakePool = () => {
  const rows: Array<Record<string, unknown>> = []
  let clock = 0
  return {
    rows,
    pool: {
      async query(sql: string, params: unknown[] = []) {
        if (sql.startsWith('INSERT INTO agent_acceptance')) {
          const [agent, pass, tools, codes, by_id, canaries] = params
          clock += 1
          rows.push({
            agent,
            pass,
            tools,
            codes,
            by_id,
            canaries,
            at: new Date(Date.UTC(2026, 8, 24, 7, clock)).toISOString(),
          })
          return { rows: [] }
        }
        if (sql.includes('SELECT agent, at, pass FROM agent_acceptance')) {
          return { rows: [...rows] }
        }
        if (sql.includes('DISTINCT ON (agent)')) {
          const latest = new Map<string, Record<string, unknown>>()
          for (const r of rows) latest.set(String(r.agent), r)
          return { rows: [...latest.values()] }
        }
        return { rows: [] }
      },
    },
  }
}

const deps = (
  pool: ReturnType<typeof fakePool>['pool'],
  who: string | null,
  body = ''
): AcceptanceDeps => ({
  getPool: async () => pool,
  identity: () => who,
  keepers: () => [KEEPER],
  readBody: async () => body,
})

const post = { url: '/api/agents/acceptance', method: 'POST' }
const get = { url: '/api/agents/acceptance', method: 'GET' }

beforeEach(() => resetAcceptanceTableForTests())

describe('who may write a verdict', () => {
  const body = JSON.stringify({
    verdicts: [{ agent: 'job', pass: true, tools: ['job_hunters'] }],
  })

  it('a keeper writes, and anybody reads the latest per agent', async () => {
    const { pool } = fakePool()
    const w = await handleAcceptance(post, deps(pool, KEEPER, body))
    expect(w).toMatchObject({ status: 200, body: { ok: true, kept: 1 } })
    const r = await handleAcceptance(get, deps(pool, null))
    expect(r.status).toBe(200)
    expect(r.body.verdicts).toMatchObject([
      { agent: 'job', pass: true, tools: ['job_hunters'], codes: [] },
    ])
  })

  it('nobody else can write "pass" for an agent', async () => {
    const { pool, rows } = fakePool()
    expect((await handleAcceptance(post, deps(pool, null, body))).status).toBe(
      401
    )
    expect(
      (await handleAcceptance(post, deps(pool, '900000001', body))).status
    ).toBe(403)
    expect(rows).toHaveLength(0)
  })

  it('the newest run wins: a later failure replaces an earlier pass', async () => {
    const { pool } = fakePool()
    await handleAcceptance(post, deps(pool, KEEPER, body))
    await handleAcceptance(
      post,
      deps(
        pool,
        KEEPER,
        JSON.stringify({
          verdicts: [{ agent: 'job', pass: false, codes: ['no_answer'] }],
        })
      )
    )
    const r = await handleAcceptance(get, deps(pool, null))
    expect(r.body.verdicts).toMatchObject([
      { agent: 'job', pass: false, codes: ['no_answer'] },
    ])
  })
})

describe('what a verdict may carry', () => {
  it('names only: no answer text, no error prose, no odd tool names', () => {
    const v = verdictOf({
      agent: 'scientist',
      pass: false,
      tools: ['web_read', 'rm -rf /', 'browser_open'],
      codes: ['http', 'the page said: my phone is +7…'],
      text: 'what the canary read on the owner account',
      error: 'stack trace',
    })
    expect(v).toEqual({
      agent: 'scientist',
      pass: false,
      tools: ['web_read', 'browser_open'],
      codes: ['http'],
    })
  })

  it('a pass carries no failure codes, and junk is not a verdict', () => {
    expect(
      verdictOf({ agent: 'x', pass: true, codes: ['acted'] })?.codes
    ).toEqual([])
    expect(verdictOf({ agent: 'Bad Id', pass: true })).toBeNull()
    expect(verdictOf({ agent: 'job', pass: 'yes' })).toBeNull()
    expect(verdictOf(null)).toBeNull()
  })

  it('a body with no valid verdict is refused, not stored empty', async () => {
    const { pool, rows } = fakePool()
    const r = await handleAcceptance(
      post,
      deps(pool, KEEPER, JSON.stringify({ verdicts: [{ agent: 'NO' }] }))
    )
    expect(r.status).toBe(400)
    expect(rows).toHaveLength(0)
  })
})

describe('an unreadable table', () => {
  it('is "unavailable", never "no agent was ever checked"', async () => {
    const r = await handleAcceptance(get, {
      getPool: async () => ({
        query: async () => {
          throw new Error('db down')
        },
      }),
      identity: () => null,
      keepers: () => [],
      readBody: async () => '',
    })
    expect(r.status).toBe(503)
    expect(r.body).not.toHaveProperty('verdicts')
  })
})

describe('which canary table a verdict was made under', () => {
  it('a run says its table fingerprint, and the reader gets it back', async () => {
    const { pool } = fakePool()
    await handleAcceptance(
      post,
      deps(
        pool,
        KEEPER,
        JSON.stringify({
          canaries: 'abcdef012345',
          verdicts: [{ agent: 'job', pass: true }],
        })
      )
    )
    const r = await handleAcceptance(get, deps(pool, null))
    expect(r.body.verdicts).toMatchObject([
      { agent: 'job', canaries: 'abcdef012345' },
    ])
  })

  it('anything that is not a fingerprint is stored as unknown', async () => {
    const { pool, rows } = fakePool()
    await handleAcceptance(
      post,
      deps(
        pool,
        KEEPER,
        JSON.stringify({
          canaries: '<script>',
          verdicts: [{ agent: 'job', pass: true }],
        })
      )
    )
    expect(rows[0].canaries).toBe('')
  })
})

/*
 * HIRE BY EVIDENCE: seven passing days in a row open a trainee to everybody.
 * Each case is a way a streak could be counted too generously.
 */
describe('the passing streak', () => {
  const NOW = Date.UTC(2026, 9, 1, 12, 0)
  const day = (d: number, pass = true, hour = 8) => ({
    at: new Date(Date.UTC(2026, 9, 1 - d, hour)).toISOString(),
    pass,
  })

  it('counts consecutive passing days up to the newest', () => {
    expect(
      streakOf(
        [0, 1, 2, 3, 4, 5, 6].map(d => day(d)),
        NOW
      )
    ).toBe(7)
    expect(STREAK_DAYS).toBe(7)
  })

  it('one failure that day fails the whole day', () => {
    expect(streakOf([day(0), day(0, false, 9), day(1)], NOW)).toBe(0)
    expect(streakOf([day(0), day(1, false), day(2), day(3)], NOW)).toBe(1)
  })

  it('a day with no check breaks the run: an outage is not evidence', () => {
    expect(streakOf([day(0), day(1), day(3), day(4)], NOW)).toBe(2)
  })

  it('a streak whose checks stopped is not current', () => {
    const old = [3, 4, 5, 6, 7, 8, 9].map(d => day(d))
    expect(streakOf(old, NOW)).toBe(0)
  })

  it("the reader gets each agent's streak and whether it earned the market", async () => {
    const { pool } = fakePool()
    await handleAcceptance(
      post,
      deps(
        pool,
        KEEPER,
        JSON.stringify({ verdicts: [{ agent: 'job', pass: true }] })
      )
    )
    const r = await handleAcceptance(get, deps(pool, null))
    expect(r.body.streakDays).toBe(7)
    expect(r.body.verdicts).toMatchObject([
      { agent: 'job', streak: expect.any(Number), earned: false },
    ])
  })
})
