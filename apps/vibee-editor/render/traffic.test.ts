import { beforeEach, describe, expect, it } from 'vitest'
import {
  ARRIVALS_PER_MINUTE,
  TRAFFIC_TOOLS,
  allowArrival,
  arrivalOf,
  handleTraffic,
  resetTrafficTableForTests,
} from './src/agent/traffic'

/**
 * WHERE THE TRAFFIC COMES FROM (epic #2974). Each case is a way a public
 * counter could leak, lie or be stuffed.
 */

const counted: unknown[][] = []
const pool = {
  async query(sql: string, params: unknown[] = []) {
    if (sql.startsWith('INSERT INTO traffic_arrivals')) counted.push(params)
    if (sql.includes('FROM traffic_arrivals'))
      return {
        rows: [
          { source: 'x', medium: 'social', campaign: 'blog', arrivals: 7 },
          { source: 'reddit', medium: 'social', campaign: 'blog', arrivals: 2 },
        ],
      }
    return { rows: [] }
  },
}

const post = (body: unknown, address = '10.0.0.1') =>
  handleTraffic(
    { url: '/api/traffic/arrival', method: 'POST' },
    {
      getPool: async () => pool,
      readBody: async () => JSON.stringify(body),
      address,
      now: () => Date.UTC(2026, 8, 24, 9, 0, 0),
    }
  )

beforeEach(() => {
  counted.length = 0
  resetTrafficTableForTests()
})

describe('an arrival', () => {
  it('is counted by channel only: nothing personal is stored', async () => {
    const r = await post({
      source: 'X',
      medium: 'social',
      campaign: 'Blog',
      content: 'gf-t',
      email: 'someone@example.com',
      userId: 144022504,
    })
    expect(r.status).toBe(200)
    expect(counted).toEqual([['x', 'social', 'blog', 'gf-t']])
    expect(JSON.stringify(counted)).not.toContain('example.com')
    expect(JSON.stringify(counted)).not.toContain('10.0.0.1')
  })

  it('without a source it is not counted', async () => {
    expect((await post({ medium: 'social' })).status).toBe(400)
    expect(arrivalOf({ source: '   ' })).toBeNull()
    expect(counted).toHaveLength(0)
  })

  it('odd values are cleaned to short tokens, never stored as sent', () => {
    expect(arrivalOf({ source: '<script>alert(1)</script>' })?.source).toBe(
      'script-alert-1-script'
    )
    expect(arrivalOf({ source: 'x'.repeat(500) })?.source).toHaveLength(60)
  })

  it('one address cannot stuff the counter', async () => {
    for (let i = 0; i < ARRIVALS_PER_MINUTE; i += 1)
      expect((await post({ source: 'x' }, '10.0.0.9')).status).toBe(200)
    expect((await post({ source: 'x' }, '10.0.0.9')).status).toBe(429)
    /* Somebody else is not punished for it. */
    expect((await post({ source: 'x' }, '10.0.0.8')).status).toBe(200)
    /* And the next minute counts again. */
    expect(allowArrival('10.0.0.9', Date.UTC(2026, 8, 24, 9, 1, 1))).toBe(true)
  })

  it('only POST is served', async () => {
    const r = await handleTraffic(
      { url: '/api/traffic/arrival', method: 'GET' },
      { getPool: async () => pool, readBody: async () => '', address: 'a' }
    )
    expect(r.status).toBe(405)
  })
})

describe('reading where people come from', () => {
  const tool = TRAFFIC_TOOLS.find(t => t.name === 'crm_traffic')!

  it('the owner gets arrivals by channel, most first, with a total', async () => {
    const out = (await tool.handler({ days: 7 }, {
      telegramId: process.env.OWNER_TELEGRAM_ID || '144022504',
      pool,
    } as never)) as { total: number; channels: Array<{ source: string }> }
    expect(out.total).toBe(9)
    expect(out.channels.map(c => c.source)).toEqual(['x', 'reddit'])
  })

  it('nobody else may read it', async () => {
    await expect(
      tool.handler({}, { telegramId: '900000001', pool } as never)
    ).rejects.toThrow()
  })
})
