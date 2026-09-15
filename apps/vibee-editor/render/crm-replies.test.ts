import { describe, it, expect, afterAll, vi } from 'vitest'
import { noteReply, REPLY_IS_FRESH_MS } from './src/agent/crm-replies'

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
 * A pool that answers the two questions noteReply asks and records what it
 * would insert. It HONOURS the conditions: `ourWordAt` only comes back when
 * it really falls inside the window the query asks for.
 */
function fakePool(opts: {
  lastReplied?: string | null
  ourWordAt?: string | null
}) {
  const inserts: unknown[][] = []
  return {
    inserts,
    query: async (sql: string, params: unknown[] = []) => {
      if (/kind = 'replied'/.test(sql)) {
        return { rows: [{ at: opts.lastReplied ?? null }] }
      }
      if (/FROM crm_messages/.test(sql)) {
        const after = new Date(String(params[2])).getTime()
        const before = new Date(String(params[3])).getTime()
        const word = opts.ourWordAt ? new Date(opts.ourWordAt).getTime() : NaN
        const inside = Number.isFinite(word) && word > after && word < before
        return { rows: inside ? [{ '?column?': 1 }] : [] }
      }
      if (/INSERT INTO crm_touches/.test(sql)) inserts.push(params)
      return { rows: [] }
    },
  }
}

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
