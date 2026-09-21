/**
 * A PROMISE MADE DURING AN OUTAGE IS STILL A PROMISE.
 *
 * Lead 2086031075, 2026-09-21: she asked for a picture three times in four
 * minutes while the drawing providers were timing out, was told the truth,
 * and then heard nothing for fourteen hours -- because the queue asks "did
 * they speak last?" and our own apology was the last word.
 *
 * What this pins:
 *   - an open debt is taken on once and keeps its original age;
 *   - a delivered picture settles it, for that person only;
 *   - the queue puts a person we owe back at the top no matter who spoke
 *     last, and says what is owed -- `deliver` when the pictures are back,
 *     `reply` while they are still down;
 *   - the words that count as asking for a picture.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  noteOwed,
  openDebts,
  settleOwed,
  asksForAPicture,
  forgetOwedTableForTests,
} from './src/agent/crm-owed'
import {
  leadCandidates,
  forgetMemoryTableForTests,
} from './src/agent/chat-memory'

const OWNER = '144022504'
const LENA = '2086031075'
const D = (iso: string) => new Date(iso)

/** A pool that keeps crm_owed rows in a Map, the way Postgres would. */
function owedPool() {
  const rows = new Map<
    string,
    { what: string; why: string; at: Date; settled: Date | null }
  >()
  const now = () => new Date('2026-09-21T17:14:45Z')
  return {
    rows,
    query: async (sql: string, p: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      if (/^CREATE/.test(flat)) return { rows: [] }
      const key = `${p[0]}|${p[1]}`
      if (/^INSERT INTO crm_owed/.test(flat)) {
        const open = rows.get(key)
        // ON CONFLICT ... WHERE settled_at IS NOT NULL: an open debt stands.
        if (!open || open.settled)
          rows.set(key, {
            what: String(p[2]),
            why: String(p[3]),
            at: now(),
            settled: null,
          })
        return { rows: [] }
      }
      if (/^UPDATE crm_owed/.test(flat)) {
        const open = rows.get(key)
        if (open && !open.settled) open.settled = now()
        return { rows: [] }
      }
      if (/^SELECT lead_id, what, why, at FROM crm_owed/.test(flat)) {
        return {
          rows: [...rows.entries()]
            .filter(([k, v]) => k.startsWith(`${p[0]}|`) && !v.settled)
            .map(([k, v]) => ({
              lead_id: k.split('|')[1],
              what: v.what,
              why: v.why,
              at: v.at,
            })),
        }
      }
      return { rows: [] }
    },
  }
}

beforeEach(() => {
  forgetOwedTableForTests()
  forgetMemoryTableForTests()
})

describe('the debt is written down against a name', () => {
  it('records what was promised, to whom, and why it did not happen', async () => {
    const pool = owedPool()
    await noteOwed(pool as never, {
      owner: OWNER,
      lead: LENA,
      what: 'picture',
      why: 'Kie did not answer in time',
    })
    const open = await openDebts(pool as never, OWNER)
    expect(open.get(LENA)).toMatchObject({
      what: 'picture',
      why: 'Kie did not answer in time',
    })
  })

  it('a second failure does not reset the clock -- the age is the signal', async () => {
    const pool = owedPool()
    await noteOwed(pool as never, {
      owner: OWNER,
      lead: LENA,
      what: 'picture',
      why: 'first',
    })
    await noteOwed(pool as never, {
      owner: OWNER,
      lead: LENA,
      what: 'picture',
      why: 'second',
    })
    const open = await openDebts(pool as never, OWNER)
    expect(open.size).toBe(1)
    expect(open.get(LENA)?.why).toBe('first')
  })

  it('a delivered picture settles that person, and only that person', async () => {
    const pool = owedPool()
    for (const lead of [LENA, '435572800'])
      await noteOwed(pool as never, {
        owner: OWNER,
        lead,
        what: 'picture',
        why: 'timeout',
      })
    await settleOwed(pool as never, OWNER, LENA)
    const open = await openDebts(pool as never, OWNER)
    expect(open.has(LENA)).toBe(false)
    expect(open.has('435572800')).toBe(true)
  })

  it('a pool that is down changes nothing about the turn', async () => {
    const dead = {
      query: async () => {
        throw new Error('no route to host')
      },
    }
    await expect(
      noteOwed(dead as never, {
        owner: OWNER,
        lead: LENA,
        what: 'picture',
        why: 'x',
      })
    ).resolves.toBeUndefined()
    expect((await openDebts(dead as never, OWNER)).size).toBe(0)
  })
})

describe('what counts as asking for a picture', () => {
  it('hears the words she actually used', () => {
    for (const t of [
      'Фото',
      'фотку сделай',
      'нарисуй портрет',
      'a picture?',
      'жду фото',
    ])
      expect(asksForAPicture(t)).toBe(true)
  })
  it('does not invent a debt out of nothing', () => {
    for (const t of ['сколько стоит?', '', null, 'спасибо, подумаю'])
      expect(asksForAPicture(t)).toBe(false)
  })
})

/** The aggregate row the queue reads, with our word newer than hers. */
function queuePool() {
  return {
    query: async (sql: string) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      if (/FROM crm_messages WHERE owner_id = \$1 GROUP BY lead_id/.test(flat))
        return {
          rows: [
            {
              lead_id: LENA,
              total: 12,
              inbound: 6,
              // Exactly the shape of 2026-09-21: her 17:14, our 17:18.
              last_in: '2026-09-21T17:14:23Z',
              last_out: '2026-09-21T17:18:24Z',
            },
          ],
        }
      return { rows: [] }
    },
  }
}

describe('the queue goes back to the person we owe', () => {
  const now = D('2026-09-22T07:00:00Z')

  it('without the debt she is parked -- this is the bug, pinned', async () => {
    const [c] = await leadCandidates(queuePool() as never, OWNER, { now })
    expect(c.unanswered).toBe(false)
    expect(c.next).toBe('wait')
  })

  it('an open debt makes it a delivery once the pictures are back', async () => {
    const owed = new Map([
      [
        LENA,
        {
          what: 'picture',
          why: 'Kie did not answer in time',
          at: D('2026-09-21T17:14:45Z'),
        },
      ],
    ])
    const [c] = await leadCandidates(queuePool() as never, OWNER, { now, owed })
    expect(c.next).toBe('deliver')
    expect(c.score).toBeGreaterThan(0)
    expect(c.because).toContain('picture')
    // The owner reads how long she has been waiting, in hours.
    expect(c.because).toMatch(/13 ч/) // cyrillic-ok: the owner reads this
  })

  it('while the pictures are still down she is owed a word, not a promise', async () => {
    const owed = new Map([
      [
        LENA,
        { what: 'picture', why: 'timeout', at: D('2026-09-21T17:14:45Z') },
      ],
    ])
    const [c] = await leadCandidates(queuePool() as never, OWNER, {
      now,
      owed,
      imagesDown: { why: 'timeout', minutesAgo: 5 },
    })
    expect(c.next).toBe('reply')
  })
})
