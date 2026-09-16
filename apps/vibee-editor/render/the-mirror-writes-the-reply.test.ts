import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * THE WIRING, NOT THE WRITER.
 *
 * crm-replies.test.ts owns thirteen cases about WHEN a reply is a reply. Every
 * one of them calls noteReply directly, and on 2026-09-16 a reverse mutation
 * proved what that costs: cutting the call out of mirrorNow left all thirteen
 * green. The same shape had already been paid for once in this project --
 * noteReply lost its caller before, nine tests noticed nothing.
 *
 * A fact with a perfect writer and no caller is not recorded. So this file
 * asserts the one thing those thirteen cannot: that the funnel every message
 * passes through actually calls it.
 *
 * It drives mirrorNow and watches the POOL, not the module, because a spy on
 * noteReply would pass just as happily if mirrorNow imported some other copy.
 * Ids are synthetic (9000000xx).
 */
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost'

const OWNER = '144022504'
const LEAD = '900000081'
/*
 * REAL now, not a calendar date. noteReply refuses anything older than
 * REPLY_IS_FRESH_MS because that is history being re-read rather than
 * somebody answering -- and a fixture pinned to a date would pass today and
 * start refusing itself in two hours. Form 33 in the blind-guards skill.
 */
const NOW = Date.now()

function pool() {
  const sqls: string[] = []
  const params: unknown[][] = []
  return {
    sqls,
    params,
    query: async (sql: string, p?: unknown[]) => {
      const flat = String(sql).replace(/\s+/g, ' ')
      sqls.push(flat)
      params.push((p ?? []) as unknown[])
      // Everything the message store writes is new, so the batch reaches
      // noteReply as fresh -- which is the only interesting case here.
      if (/INSERT INTO crm_messages/i.test(flat))
        return { rows: [{ msg_id: 1 }] }
      // No earlier `replied` touch, and we have not answered since: the
      // conditions crm-replies.test.ts owns. Here they only clear the way.
      if (/max\(t\.at\)/i.test(flat)) return { rows: [{ at: null }] }
      // Our own word stands between the last recorded reply and this one --
      // without it noteReply refuses, because they would be talking into a
      // silence rather than answering. crm-replies.test.ts owns that rule;
      // here it only has to be satisfied.
      if (/FROM crm_messages/i.test(flat)) return { rows: [{ '?column?': 1 }] }
      return { rows: [] }
    },
  }
}

const theirs = [
  {
    msgId: 1,
    at: new Date(NOW - 60_000).toISOString(),
    out: false,
    text: 'да, интересно',
  },
]

describe('the mirror writes the reply', () => {
  beforeEach(() => vi.resetModules())

  it('a client answering, mirrored, records a `replied` touch', async () => {
    const { mirrorNow } = await import('./src/agent/crm-mirror')
    const p = pool()
    await mirrorNow(p as never, OWNER, LEAD, theirs as never)
    const wrote = p.sqls.findIndex(s => /INSERT INTO crm_touches/i.test(s))
    expect(
      wrote,
      'mirrorNow stored the messages and never recorded the fact'
    ).toBeGreaterThan(-1)
    expect(p.params[wrote]).toContain('replied')
    expect(p.params[wrote]).toContain(LEAD)
  })

  it('and the touch is written AFTER the messages it is derived from', async () => {
    const { mirrorNow } = await import('./src/agent/crm-mirror')
    const p = pool()
    await mirrorNow(p as never, OWNER, LEAD, theirs as never)
    const stored = p.sqls.findIndex(s => /INSERT INTO crm_messages/i.test(s))
    const touched = p.sqls.findIndex(s => /INSERT INTO crm_touches/i.test(s))
    expect(stored).toBeGreaterThan(-1)
    expect(
      touched,
      'the reply is decided by reading the correspondence, so the batch must already be in it'
    ).toBeGreaterThan(stored)
  })

  it('nothing to mirror writes no touch at all', async () => {
    const { mirrorNow } = await import('./src/agent/crm-mirror')
    const p = pool()
    await mirrorNow(p as never, OWNER, LEAD, [] as never)
    expect(p.sqls.some(s => /INSERT INTO crm_touches/i.test(s))).toBe(false)
  })
})
