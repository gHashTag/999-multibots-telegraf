import { describe, it, expect, afterAll, afterEach, vi } from 'vitest'
import { noteReply, REPLY_IS_FRESH_MS } from './src/agent/crm-replies'
/*
 * WHERE `at` SITS IN THE INSERT.
 *
 * recordTouch writes (owner, lead, bot_name, kind, note, at), so the event
 * time is the sixth parameter, index 5. Pinned once here because the two
 * assertions below care about the VALUE -- the reply carries the client's
 * own time, not the moment we noticed it -- and a literal index repeated in
 * both would quietly turn into a promise about column order.
 */
const AT_PARAM = 5

/**
 * The `replied` touch had no writer at all: the `ours` segment was always
 * empty and the button built on it pointed at nothing. The owner's decision,
 * 2026-09-15, was to write it automatically when a client answers.
 *
 * What has to be right is WHEN. A first message is not a reply. Five messages
 * in a row are one reply. And a sweep re-reading old correspondence must not
 * stamp today's date on an answer from three weeks ago, because recordTouch
 * cannot backdate and the whole base would look freshly active.
 */

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0)
const ago = (ms: number) => new Date(NOW - ms).toISOString()

/**
 * A POOL THAT DOES NOT ANSWER BY TABLE NAME.
 *
 * The first version recognised a query by the table in it and answered from
 * the options -- which is the shape this repository has paid for before (form
 * 21 in the blind-guards skill). Every condition that makes the answer MEAN
 * something could be deleted from the real SQL and this fake would keep
 * answering exactly as before: drop `"out"` and a client's own message counts
 * as our word; drop `reverts_id IS NULL` and a cancelled reply still blocks
 * the next one; drop the upper bound and a reply is "answered" by something
 * we wrote afterwards. All green, every time.
 *
 * So it answers FROM DATA where it can -- the window is really compared --
 * and every clause it leans on must still be present in the SQL. A missing
 * one goes into `unmet`, which the tests assert is empty. It is recorded
 * rather than thrown because noteReply swallows exceptions on purpose: a
 * throw here would come back as a plain 'not recorded' and the negative
 * tests would go on passing.
 */
function fakePool(opts: {
  lastReplied?: string | null
  ourWordAt?: string | null
}) {
  const inserts: unknown[][] = []
  const unmet: string[] = []
  const flat = (sql: string) => sql.replace(/\s+/g, ' ')
  const need = (sql: string, label: string, clauses: RegExp[]) => {
    for (const c of clauses) {
      if (!c.test(flat(sql))) unmet.push(`${label} lost: ${c.source}`)
    }
  }
  const pool = {
    inserts,
    unmet,
    query: async (sql: string, params: unknown[] = []) => {
      if (/FROM crm_touches/.test(sql) && /max\(/.test(sql)) {
        need(sql, 'last replied', [
          /owner_id = \$1/,
          /lead_id = \$2/,
          /kind = 'replied'/,
          /reverts_id IS NULL/,
          /NOT EXISTS/,
        ])
        return { rows: [{ at: opts.lastReplied ?? null }] }
      }
      if (/FROM crm_messages/.test(sql)) {
        need(sql, 'our own word', [
          /owner_id = \$1/,
          /lead_id = \$2/,
          /"out"/,
          /at > \$3/,
          /at < \$4/,
        ])
        const after = new Date(String(params[2])).getTime()
        const before = new Date(String(params[3])).getTime()
        const word = opts.ourWordAt ? new Date(opts.ourWordAt).getTime() : NaN
        const inside = Number.isFinite(word) && word > after && word < before
        return { rows: inside ? [{ '?column?': 1 }] : [] }
      }
      if (/INSERT INTO crm_touches/.test(sql)) {
        inserts.push(params)
        return { rows: [{ id: inserts.length }] }
      }
      // recordTouch makes sure of its own table on the way in. DDL carries no
      // condition this pool answers, so it passes without comment -- but
      // anything else is a query this fake would be answering blind.
      if (!/^\s*(CREATE|ALTER|DROP)/i.test(sql)) {
        unmet.push(`a query nobody taught this pool: ${flat(sql).slice(0, 80)}`)
      }
      return { rows: [] }
    },
  }
  pools.push(pool)
  return pool
}

/**
 * CHECKED FOR EVERY POOL, NOT WHERE SOMEBODY REMEMBERED TO LOOK.
 *
 * A record nobody reads is the same blind guard one level up, so the check
 * is not a call a new test can forget: every pool built here is registered
 * and read after each test.
 */
const pools: Array<{ unmet: string[] }> = []
afterEach(() => {
  for (const p of pools) {
    expect(
      p.unmet,
      'the fake answered a query whose conditions it no longer sees'
    ).toEqual([])
  }
  pools.length = 0
})

const theyWrote = (whenMs: number) => [
  { msgId: 1, at: new Date(NOW - whenMs), out: false, text: 'да, интересно' },
]

describe('when a client answering is written down', () => {
  it('records the reply when we had written first', async () => {
    const pool = fakePool({ ourWordAt: ago(60_000) })
    expect(
      await noteReply(
        pool as never,
        '144022504',
        '900000001',
        theyWrote(1000),
        NOW
      )
    ).toBe('recorded')
    const [params] = pool.inserts
    expect(params[0]).toBe('144022504')
    expect(params[1]).toBe('900000001')
    expect(params[3]).toBe('replied')
  })

  it('writes nothing for somebody who wrote to us first', async () => {
    // Nothing was replied to. A `replied` touch here would put a stranger
    // into the segment for people who answered us.
    const pool = fakePool({ ourWordAt: null })
    expect(
      await noteReply(
        pool as never,
        '144022504',
        '900000001',
        theyWrote(1000),
        NOW
      )
    ).toBe('not recorded')
    expect(pool.inserts).toHaveLength(0)
  })

  it('writes nothing when the batch carries no inbound message at all', async () => {
    const pool = fakePool({ ourWordAt: ago(60_000) })
    const oursOnly = [
      { msgId: 2, at: new Date(NOW), out: true, text: 'предлагаю' },
    ]
    expect(
      await noteReply(pool as never, '1', '2', oursOnly as never, NOW)
    ).toBe('not recorded')
    expect(pool.inserts).toHaveLength(0)
  })
})

describe('the time and our own half of the exchange', () => {
  /*
   * Both were wrong until 16.09.2026 and both bent a comparison somewhere
   * else into meaning its opposite.
   */
  const theirs = {
    msgId: 1,
    at: new Date(NOW - 60_000),
    out: false,
    text: 'да',
  }
  const ours = {
    msgId: 2,
    at: new Date(NOW - 30_000),
    out: true,
    text: 'отлично',
  }

  it('stamps the reply with THEIR time, not the moment we noticed', async () => {
    // now() put the touch after our own answer -- which mirrorNow stores in
    // the same call -- so "our last word is older than this touch" read
    // backwards and the window below skipped every other reply.
    const pool = fakePool({ ourWordAt: ago(5 * 60_000) })
    await noteReply(pool as never, '1', '2', [theirs] as never, NOW)
    const [params] = pool.inserts
    // AT_PARAM is the position of `at` in the INSERT, not a promise of
    // this test. The promise is that the touch carries THEIR time.
    expect(String(params[AT_PARAM])).toBe(new Date(NOW - 60_000).toISOString())
  })

  it('writes our own answer too, or the queue never lets them go', async () => {
    /*
     * In a business DM the seller answers by itself and both messages arrive
     * in one batch. With no touch for OUR half, `replied` stayed the newest
     * touch forever and waitingOn read that as "they answered, we are
     * silent" -- so every auto-answered client sat permanently in `ours`.
     */
    const pool = fakePool({ ourWordAt: ago(5 * 60_000) })
    await noteReply(pool as never, '1', '2', [theirs, ours] as never, NOW)
    expect(pool.inserts).toHaveLength(2)
    expect(pool.inserts[0][3]).toBe('replied')
    expect(pool.inserts[1][3]).toBe('written')
    expect(String(pool.inserts[1][AT_PARAM])).toBe(
      new Date(NOW - 30_000).toISOString()
    )
  })

  it('writes only the reply when we said nothing back', async () => {
    const pool = fakePool({ ourWordAt: ago(5 * 60_000) })
    await noteReply(pool as never, '1', '2', [theirs] as never, NOW)
    expect(pool.inserts).toHaveLength(1)
    expect(pool.inserts[0][3]).toBe('replied')
  })

  it('ignores an outbound that is OLDER than their reply', async () => {
    // That one is the word they were answering, not our answer to them.
    const before = {
      msgId: 0,
      at: new Date(NOW - 90_000),
      out: true,
      text: 'предлагаю',
    }
    const pool = fakePool({ ourWordAt: ago(5 * 60_000) })
    await noteReply(pool as never, '1', '2', [before, theirs] as never, NOW)
    expect(pool.inserts).toHaveLength(1)
  })
})

describe('once per turn of ours, not once per message', () => {
  it('does not write a second time while we have said nothing since', async () => {
    // Five messages in a row are one reply. Otherwise the newest touch would
    // come to mean "they are still typing".
    const pool = fakePool({
      lastReplied: ago(10 * 60_000),
      ourWordAt: ago(30 * 60_000), // before the last reply, not after it
    })
    expect(await noteReply(pool as never, '1', '2', theyWrote(1000), NOW)).toBe(
      'not recorded'
    )
  })

  it('writes again once we have written and they answered again', async () => {
    const pool = fakePool({
      lastReplied: ago(60 * 60_000),
      ourWordAt: ago(20 * 60_000), // our answer, after the previous reply
    })
    expect(await noteReply(pool as never, '1', '2', theyWrote(1000), NOW)).toBe(
      'recorded'
    )
  })
})

describe('a sweep re-reading history is not somebody answering', () => {
  it('ignores an inbound older than the freshness window', async () => {
    /*
     * The decisive case. recordTouch stamps now() and cannot backdate, so
     * without this the first sweep over an old correspondence would mark
     * every lead as having replied today.
     */
    const pool = fakePool({ ourWordAt: ago(40 * 24 * 3600_000) })
    expect(
      await noteReply(
        pool as never,
        '1',
        '2',
        theyWrote(30 * 24 * 3600_000),
        NOW
      )
    ).toBe('not recorded')
    expect(pool.inserts).toHaveLength(0)
  })

  it('still takes a reply that arrived between sweeps', async () => {
    // The sweep runs every thirty minutes; a reply from twenty-nine minutes
    // ago is a real reply, not history.
    const pool = fakePool({ ourWordAt: ago(45 * 60_000) })
    expect(
      await noteReply(pool as never, '1', '2', theyWrote(29 * 60_000), NOW)
    ).toBe('recorded')
    expect(REPLY_IS_FRESH_MS).toBeGreaterThan(30 * 60_000)
  })
})

describe('it never breaks the mirror', () => {
  it('returns quietly when the database refuses', async () => {
    const broken = {
      query: async () => {
        throw new Error('no database')
      },
    }
    await expect(
      noteReply(broken as never, '1', '2', theyWrote(1000), NOW)
    ).resolves.toBe('not recorded')
  })

  it('survives an unusable timestamp', async () => {
    const pool = fakePool({ ourWordAt: ago(60_000) })
    const junk = [{ msgId: 1, at: new Date('nonsense'), out: false, text: 'x' }]
    expect(await noteReply(pool as never, '1', '2', junk as never, NOW)).toBe(
      'not recorded'
    )
  })
})

afterAll(() => vi.restoreAllMocks())
