import { beforeEach, describe, expect, it } from 'vitest'
import {
  handleAcceptance,
  resetAcceptanceTableForTests,
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
          const [agent, pass, tools, codes, by_id] = params
          clock += 1
          rows.push({
            agent,
            pass,
            tools,
            codes,
            by_id,
            at: new Date(Date.UTC(2026, 8, 24, 7, clock)).toISOString(),
          })
          return { rows: [] }
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
      agent: 'habr',
      pass: false,
      tools: ['web_read', 'rm -rf /', 'browser_open'],
      codes: ['http', 'the page said: my phone is +7…'],
      text: 'what the canary read on the owner account',
      error: 'stack trace',
    })
    expect(v).toEqual({
      agent: 'habr',
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
