import { describe, expect, it } from 'vitest'
import {
  clientRevenue,
  clientTimeline,
  mergeTimeline,
} from './crm-client-timeline'
import { COMPACT_TOOLS_EXCLUDED, DIRECT_CALL_ONLY, TOOLS } from './tools'

/**
 * ONE CLIENT'S HISTORY ON ONE LINE OF TIME.
 *
 * Pinned: newest first across all three sources; their words arrive framed
 * as foreign content, ours do not; a missing table costs its source only.
 * Fictional ids only (9000000xx).
 */
const OWNER = '900000080'
const LEAD = '900000081'

describe('mergeTimeline', () => {
  it('newest first across sources, cut to the limit, junk dates dropped', () => {
    const out = mergeTimeline(
      [
        [{ at: '2026-09-20T10:00:00Z', kind: 'in', text: 'a' }],
        [
          {
            at: '2026-09-22T10:00:00Z',
            kind: 'touch',
            touch: 'bought',
            text: '',
          },
        ],
        [
          { at: '2026-09-21T10:00:00Z', kind: 'group', text: 'b' },
          { at: 'not a date', kind: 'out', text: 'x' },
        ],
      ],
      2
    )
    expect(out.map(e => e.kind)).toEqual(['touch', 'group'])
  })
})

describe('clientTimeline', () => {
  const pool = (broken: string[] = []) => ({
    async query(sql: string) {
      for (const b of broken) if (sql.includes(b)) throw new Error('no table')
      if (sql.includes('FILTER (WHERE NOT "out")::int AS inbound'))
        return {
          rows: [
            {
              inbound: 3,
              outbound: 2,
              first_at: '2026-09-01T10:00:00Z',
              last_in_at: '2026-09-22T10:00:00Z',
              last_out_at: '2026-09-21T10:00:00Z',
            },
          ],
        }
      if (sql.includes('count(*)::int AS n FROM crm_group_messages'))
        return { rows: [{ n: 4 }] }
      if (sql.includes('count(*)::int AS n FROM crm_touches'))
        return { rows: [{ n: 1 }] }
      if (sql.includes('FROM crm_messages'))
        return {
          rows: [
            { at: '2026-09-22T10:00:00Z', out: false, text: 'how much?' },
            {
              at: '2026-09-21T10:00:00Z',
              out: true,
              text: 'here is the offer',
            },
          ],
        }
      if (sql.includes('FROM crm_group_messages'))
        return {
          rows: [
            {
              at: '2026-09-23T10:00:00Z',
              text: 'in the group',
              chat_id: '-900000082',
              title: 'Club',
            },
          ],
        }
      if (sql.includes('FROM crm_touches'))
        return {
          rows: [
            { at: '2026-09-21T11:00:00Z', kind: 'written', note: 'offer' },
          ],
        }
      return { rows: [] }
    },
  })

  it('merges DMs, group lines and touches, and counts them', async () => {
    const t = await clientTimeline(pool(), OWNER, LEAD)
    expect(t.events.map(e => e.kind)).toEqual(['group', 'in', 'touch', 'out'])
    expect(t.events[0].chat_title).toBe('Club')
    expect(t.stats).toEqual({
      inbound: 3,
      outbound: 2,
      group_posts: 4,
      touches: 1,
      first_at: '2026-09-01T10:00:00.000Z',
      last_in_at: '2026-09-22T10:00:00.000Z',
      last_out_at: '2026-09-21T10:00:00.000Z',
    })
  })

  it('their words are framed as foreign content, ours are not', async () => {
    const t = await clientTimeline(pool(), OWNER, LEAD)
    expect(t.events.find(e => e.kind === 'in')!.text).toContain('FOREIGN')
    expect(t.events.find(e => e.kind === 'group')!.text).toContain('FOREIGN')
    expect(t.events.find(e => e.kind === 'out')!.text).toBe('here is the offer')
  })

  it('a missing table costs its source, not the feed', async () => {
    const t = await clientTimeline(pool(['crm_group_messages']), OWNER, LEAD)
    expect(t.events.map(e => e.kind)).toEqual(['in', 'touch', 'out'])
    expect(t.stats.group_posts).toBe(0)
  })
})

describe('registry', () => {
  it('a screen: registered, direct-call only, out of the compact kit', () => {
    expect(TOOLS.some(t => t.name === 'crm_client_timeline')).toBe(true)
    expect(DIRECT_CALL_ONLY.has('crm_client_timeline')).toBe(true)
    expect(COMPACT_TOOLS_EXCLUDED.test('crm_client_timeline')).toBe(true)
  })
})

describe('clientRevenue', () => {
  it('sums the purchases in the live wallet and says when last', async () => {
    const seen: string[] = []
    const pool = {
      query: async (sql: string) => {
        seen.push(sql)
        return { rows: [{ stars: 1500, last: '2026-09-20T10:00:00Z' }] }
      },
    }
    expect(await clientRevenue(pool, LEAD)).toEqual({
      revenue: 1500,
      last_paid_at: '2026-09-20T10:00:00.000Z',
    })
    expect(seen[0]).toMatch(/kind = 'purchase'/)
  })

  it('an unreadable ledger is unknown, not zero', async () => {
    const pool = {
      query: async () => {
        throw new Error('down')
      },
    }
    expect(await clientRevenue(pool, LEAD)).toEqual({
      revenue: null,
      last_paid_at: null,
    })
  })
})
