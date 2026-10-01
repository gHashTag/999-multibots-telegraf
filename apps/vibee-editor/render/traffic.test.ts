import { beforeEach, describe, expect, it } from 'vitest'
import {
  ARRIVALS_PER_MINUTE,
  TRAFFIC_TOOLS,
  allowArrival,
  arrivalOf,
  handleTraffic,
  resetTrafficTableForTests,
  welcomeFunnel,
  welcomeHitOf,
} from './src/agent/traffic'

/**
 * WHERE THE TRAFFIC COMES FROM (epic #2974). Each case is a way a public
 * counter could leak, lie or be stuffed.
 */

const counted: unknown[][] = []
const started: unknown[][] = []
const welcomed: unknown[][] = []
const pool = {
  async query(sql: string, params: unknown[] = []) {
    if (sql.startsWith('INSERT INTO traffic_arrivals')) counted.push(params)
    if (sql.startsWith('INSERT INTO traffic_starts')) started.push(params)
    if (sql.startsWith('INSERT INTO traffic_welcome')) welcomed.push(params)
    if (sql.includes('FROM traffic_welcome'))
      return {
        rows: [
          { step: 'shown', item: '', n: 40 },
          { step: 'packages_seen', item: '', n: 10 },
          { step: 'package_order', item: 'blogger', n: 2 },
        ],
      }
    if (sql.includes('FROM traffic_starts'))
      return {
        rows: [
          { source: 'telegram', starts: 3 },
          { source: 'x', starts: 1 },
        ],
      }
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
  started.length = 0
  welcomed.length = 0
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
    /* Visits and bot starts side by side; a source with starts only counts. */
    const o = out as unknown as {
      totalStarts: number
      sources: Array<{ source: string; arrivals: number; starts: number }>
    }
    expect(o.totalStarts).toBe(4)
    expect(o.sources).toEqual([
      { source: 'x', arrivals: 7, starts: 1 },
      { source: 'telegram', arrivals: 0, starts: 3 },
      { source: 'reddit', arrivals: 2, starts: 0 },
    ])
  })

  it('nobody else may read it', async () => {
    await expect(
      tool.handler({}, { telegramId: '900000001', pool } as never)
    ).rejects.toThrow()
  })
})

describe('a start of our bot from a tagged link', () => {
  const start = (body: unknown, serviceKey: boolean) =>
    handleTraffic(
      { url: '/api/traffic/start', method: 'POST' },
      {
        getPool: async () => pool,
        readBody: async () => JSON.stringify(body),
        address: '10.0.0.1',
        serviceKey,
      }
    )

  it('is counted only when the bot process sends it with the service key', async () => {
    expect((await start({ source: 'telegram' }, false)).status).toBe(403)
    expect(started).toHaveLength(0)
    const r = await start(
      { source: 'Telegram', campaign: 'app_feed', telegram_id: 144022504 },
      true
    )
    expect(r.status).toBe(200)
    /* The channel and what the link opened; never who pressed it. */
    expect(started).toEqual([['telegram', 'app_feed']])
  })

  it('without a source nothing is counted', async () => {
    expect((await start({ campaign: 'club' }, true)).status).toBe(400)
    expect(started).toHaveLength(0)
  })

  it('the guard keeps the start closed to pages', async () => {
    const { isPublic } = await import('./auth')
    expect(
      isPublic({ url: '/api/traffic/start', method: 'POST' } as never)
    ).toBe(false)
  })
})

describe('the welcome screen heatmap', () => {
  const step = (body: unknown, address = '10.0.1.1') =>
    handleTraffic(
      { url: '/api/traffic/welcome', method: 'POST' },
      {
        getPool: async () => pool,
        readBody: async () => JSON.stringify(body),
        address,
        now: () => Date.UTC(2026, 9, 1, 9, 0, 0),
      }
    )

  it('counts a step from the closed list, with a package it names', async () => {
    expect(
      (await step({ step: 'package_order', item: 'Blogger' })).status
    ).toBe(200)
    expect((await step({ step: 'shown', telegram_id: 144022504 })).status).toBe(
      200
    )
    expect(welcomed).toEqual([
      ['package_order', 'blogger'],
      ['shown', ''],
    ])
  })

  it('an unknown step is refused, an unknown item is dropped', async () => {
    expect((await step({ step: 'drop table' })).status).toBe(400)
    expect(welcomeHitOf({ step: 'skip', item: '<script>' })).toEqual({
      step: 'skip',
      item: '',
    })
    expect(welcomed).toHaveLength(0)
  })

  it('shares the per-address limit with arrivals', async () => {
    for (let i = 0; i < ARRIVALS_PER_MINUTE; i += 1)
      await step({ step: 'shown' }, '10.0.1.9')
    expect((await step({ step: 'shown' }, '10.0.1.9')).status).toBe(429)
  })

  it('the funnel is a share of shows, and zero shows is zero, not NaN', () => {
    const f = welcomeFunnel([
      { step: 'shown', item: '', n: 40 },
      { step: 'packages_seen', item: '', n: 10 },
      { step: 'package_try', item: 'blogger', n: 3 },
      { step: 'pinned_order', item: '', n: 1 },
      { step: 'package_order', item: 'twin', n: 1 },
    ])
    expect(f).toMatchObject({
      shown: 40,
      packagesSeen: 10,
      tried: 3,
      ordered: 2,
      reachedPackages: 25,
      orderRate: 5,
    })
    expect(welcomeFunnel([]).orderRate).toBe(0)
  })

  it('the owner reads it next to the channels', async () => {
    const tool = TRAFFIC_TOOLS.find(t => t.name === 'crm_traffic')!
    const out = (await tool.handler({ days: 7 }, {
      telegramId: process.env.OWNER_TELEGRAM_ID || '144022504',
      pool,
    } as never)) as {
      welcome: { funnel: { shown: number; ordered: number }; steps: unknown[] }
    }
    expect(out.welcome.funnel).toMatchObject({ shown: 40, ordered: 2 })
    expect(out.welcome.steps).toHaveLength(3)
  })
})
