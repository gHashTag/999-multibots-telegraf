import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  visibilityOf,
  canSeeBot,
  canSeePerson,
  botFilter,
  keepers,
} from './src/hive/roles'

/**
 * THE BORDER BETWEEN CLIENTS -- THE MOST EXPENSIVE THING IN THIS SYSTEM.
 *
 * Owner, 2026-09-07: "clients must not know about other clients".
 *
 * Measured the same day: `users` in Supabase is ONE table for the whole
 * platform, 2380 people belonging to sixteen bot owners, and the separation
 * happens at READ time. While the rule lives in people's heads, one forgotten
 * line means a leak.
 *
 * Here it is pinned down. Every test below describes not "a function" but what
 * a person must NOT see.
 */

const source = (map: Record<string, string[]>) => ({
  async botsOwnedBy(id: string) {
    return map[id] ?? []
  },
})

describe('hive roles', () => {
  const saved = process.env.HIVE_KEEPERS
  beforeEach(() => {
    process.env.HIVE_KEEPERS = '100'
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.HIVE_KEEPERS
    else process.env.HIVE_KEEPERS = saved
  })

  it('an ordinary person is a bee: sees THEMSELVES and nothing more', async () => {
    const v = await visibilityOf('777', source({}))
    expect(v.role).toBe('bee')
    expect(v.bots).toEqual([])
    expect(canSeePerson(v, '777')).toBe(true)
    expect(canSeePerson(v, '778'), 'a bee sees another person').toBe(false)
    expect(canSeeBot(v, 'any_bot'), 'a bee sees a bot').toBe(false)
  })

  it('an owner sees THEIR bots and does NOT see other ones', async () => {
    const v = await visibilityOf('200', source({ '200': ['bot_a', 'bot_b'] }))
    expect(v.role).toBe('owner')
    expect(canSeeBot(v, 'bot_a')).toBe(true)
    expect(canSeeBot(v, 'bot_other'), 'an owner sees another bot').toBe(false)
  })

  it('AN OWNER DOES NOT READ ANOTHER PROFILE BY ID', async () => {
    /*
     * Otherwise the "my clients" border is walked around by counting upwards: a
     * bot owner substitutes somebody else's telegram_id and reads the profile
     * of a person who has nothing to do with their bots.
     */
    const v = await visibilityOf('200', source({ '200': ['bot_a'] }))
    expect(canSeePerson(v, '999')).toBe(false)
    expect(canSeePerson(v, '200')).toBe(true)
  })

  it('a keeper sees the whole farm', async () => {
    const v = await visibilityOf('100', source({}))
    expect(v.role).toBe('keeper')
    expect(v.bots).toBeNull()
    expect(canSeeBot(v, 'anything')).toBe(true)
    expect(canSeePerson(v, '999')).toBe(true)
  })

  it('AN UNIDENTIFIED CALLER GETS NOTHING', async () => {
    // Not "the public part" and not "a summary": a platform summary also tells
    // them about other people -- at the very least, how many there are.
    for (const nobody of [null, undefined, '', '   ']) {
      const v = await visibilityOf(nobody, source({ '': ['bot_a'] }))
      expect(v.role).toBe('bee')
      expect(v.bots).toEqual([])
      expect(canSeePerson(v, '777')).toBe(false)
      expect(canSeePerson(v, ''), 'an empty caller sees an empty person').toBe(false)
    }
  })

  it('A DATABASE FAILURE CLOSES RATHER THAN OPENS', async () => {
    /*
     * The opposite choice would turn any network hiccup into a leak: "we could
     * not establish ownership" would become "show everything".
     */
    const v = await visibilityOf('200', {
      async botsOwnedBy() {
        throw new Error('database unreachable')
      },
    })
    expect(v.role).toBe('bee')
    expect(v.bots).toEqual([])
  })

  it('with no keeper configured, NOBODY becomes one', async () => {
    // A missing setting must not silently appoint somebody in charge.
    delete process.env.HIVE_KEEPERS
    const savedOwner = process.env.OWNER_TELEGRAM_ID
    delete process.env.OWNER_TELEGRAM_ID
    try {
      expect(keepers()).toEqual([])
      const v = await visibilityOf('100', source({}))
      expect(v.role).toBe('bee')
    } finally {
      if (savedOwner !== undefined) process.env.OWNER_TELEGRAM_ID = savedOwner
    }
  })

  it('there may be more than one keeper', async () => {
    process.env.HIVE_KEEPERS = '100, 101 ,102'
    expect((await visibilityOf('101', source({}))).role).toBe('keeper')
    expect((await visibilityOf('103', source({}))).role).toBe('bee')
  })

  it('the filter tells "everything" apart from "nothing"', async () => {
    /*
     * `null` (keeper) and `[]` (bee) are OPPOSITES here. Confusing them means
     * showing the whole farm to someone who may see nothing; in code that
     * confusion looks like a harmless `?? []`.
     */
    expect(botFilter(await visibilityOf('100', source({})))).toBeNull()
    expect(botFilter(await visibilityOf('777', source({})))).toEqual([])
    expect(botFilter(await visibilityOf('200', source({ '200': ['b'] })))).toEqual([
      'b',
    ])
  })

  it('an empty bot name does not pass as "any"', async () => {
    // An empty string in a filter is the classic way to remove a filter by
    // accident.
    const v = await visibilityOf('200', source({ '200': ['bot_a'] }))
    expect(canSeeBot(v, '')).toBe(false)
    expect(canSeeBot(v, '   ')).toBe(false)
  })
})
