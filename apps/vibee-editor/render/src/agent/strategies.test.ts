import { describe, it, expect, beforeEach } from 'vitest'
import {
  siteOf,
  roundStrategyOf,
  readStrategy,
  writeStrategy,
  resetStrategiesForTests,
  MAX_SITES,
  MIN_EVERY_MIN,
  type RoundStrategy,
} from './strategies'

const DEFAULT: RoundStrategy = {
  sites: [{ name: 'X', url: 'https://x.com/notifications' }],
  everyMin: 180,
  settleMs: 6000,
}

beforeEach(() => resetStrategiesForTests())

describe('what counts as a site', () => {
  it('https with a real host, named or named after itself', () => {
    expect(siteOf({ url: 'https://www.hh.ru/applicant' })).toEqual({
      name: 'hh.ru',
      url: 'https://www.hh.ru/applicant',
    })
    expect(siteOf({ name: 'Work', url: 'https://hh.ru' })?.name).toBe('Work')
  })

  it('never a script, a file or plain http', () => {
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'http://x.com',
      'chrome://newtab',
      'not a url',
    ])
      expect(siteOf({ url })).toBeNull()
  })
})

describe('a saved strategy overrides, never breaks', () => {
  it('takes the sites, the pace and the patience it was given', () => {
    const got = roundStrategyOf(
      {
        sites: [{ name: 'hh.ru', url: 'https://hh.ru/applicant/negotiations' }],
        everyMin: 60,
        settleMs: 9000,
      },
      DEFAULT
    )
    expect(got.sites).toEqual([
      { name: 'hh.ru', url: 'https://hh.ru/applicant/negotiations' },
    ])
    expect(got).toMatchObject({ everyMin: 60, settleMs: 9000 })
  })

  it('falls back to the code for anything missing or senseless', () => {
    expect(roundStrategyOf(null, DEFAULT)).toEqual(DEFAULT)
    expect(roundStrategyOf({ sites: 'all of them' }, DEFAULT).sites).toEqual(
      DEFAULT.sites
    )
    expect(
      roundStrategyOf({ sites: [{ url: 'javascript:x' }] }, DEFAULT).sites
    ).toEqual(DEFAULT.sites)
  })

  it('keeps the agent from becoming a nuisance', () => {
    expect(roundStrategyOf({ everyMin: 1 }, DEFAULT).everyMin).toBe(
      MIN_EVERY_MIN
    )
    expect(roundStrategyOf({ everyMin: 99999 }, DEFAULT).everyMin).toBe(24 * 60)
    expect(roundStrategyOf({ settleMs: 1 }, DEFAULT).settleMs).toBe(1000)
    const many = Array.from({ length: 30 }, (_, i) => ({
      url: `https://site${i}.com`,
    }))
    expect(roundStrategyOf({ sites: many }, DEFAULT).sites).toHaveLength(
      MAX_SITES
    )
  })
})

describe('the row itself', () => {
  it('is written and read back, and a sick database is not fatal', async () => {
    const store = new Map<string, unknown>()
    const db = {
      async query(sql: string, params: unknown[] = []) {
        if (sql.includes('INSERT INTO agent_strategies')) {
          store.set(params[0] as string, JSON.parse(params[1] as string))
          return { rows: [] }
        }
        if (sql.includes('SELECT value FROM agent_strategies')) {
          const v = store.get(params[0] as string)
          return { rows: v === undefined ? [] : [{ value: v }] }
        }
        return { rows: [] }
      },
    }
    await writeStrategy(db, 'rounds', { everyMin: 45 })
    expect(await readStrategy(db, 'rounds')).toEqual({ everyMin: 45 })
    resetStrategiesForTests()
    const sick = {
      async query() {
        throw new Error('no database')
      },
    }
    expect(await readStrategy(sick, 'rounds')).toBeNull()
  })
})
