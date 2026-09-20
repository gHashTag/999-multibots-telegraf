import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ASKING AGAIN FOR THE RECORDINGS NOBODY COULD READ.
 *
 * The transcriber answered 200 with an empty body for months, so every
 * recording was filed as "asked, there were no words" -- and a row filed that
 * way is never asked again. The verdict was wrong; this asks once more for
 * everything decided before the fault was fixed.
 *
 * What is pinned: the cut-off (a recording judged AFTER the fix keeps its
 * verdict, or silence becomes an endless paid loop), the batch, newest first,
 * and that a row is marked before the call rather than after -- so a crash
 * mid-batch costs five re-reads and not an infinite retry.
 *
 * Ids are invented (9000000xx). No real person appears in this repository.
 */
const OWNER = '900000701'

const transcribed: Array<{ owner: string; ids: number[] }> = []
beforeEach(() => {
  transcribed.length = 0
  vi.resetModules()
  vi.doMock('./media-library', () => ({
    transcribeAndMirror: async (
      _pool: unknown,
      owner: string,
      rows: Array<{ id: number }>
    ) => {
      transcribed.push({ owner, ids: rows.map(r => r.id) })
      return { described: rows.length, mirrored: rows.length }
    },
  }))
})

type Row = {
  id: number
  owner_id: string
  at: Date
  transcribed_at: Date | null
}

const poolOf = (rows: Row[]) => {
  const marked: number[][] = []
  return {
    marked,
    rows,
    async query(sql: string, params: unknown[] = []) {
      const q = sql.replace(/\s+/g, ' ')
      if (/count\(\*\)/.test(q)) {
        const before = params[0] as Date
        const n = rows.filter(
          r => r.transcribed_at !== null && r.transcribed_at < before
        ).length
        return { rows: [{ n }] }
      }
      if (/^UPDATE user_media SET transcribed_at/.test(q.trim())) {
        marked.push(params[0] as number[])
        for (const id of params[0] as number[]) {
          const r = rows.find(x => x.id === id)
          if (r) r.transcribed_at = params[1] as Date
        }
        return { rows: [], rowCount: (params[0] as number[]).length }
      }
      if (/FROM user_media/.test(q)) {
        const before = params[0] as Date
        const limit = Number(params[1])
        const out = rows
          .filter(r => r.transcribed_at !== null && r.transcribed_at < before)
          .sort((a, b) => b.at.getTime() - a.at.getTime())
          .slice(0, limit)
          .map(r => ({
            id: r.id,
            owner_id: r.owner_id,
            lead_id: '900000801',
            surface: 'business',
            msg_id: r.id,
            at: r.at,
            out: false,
            kind: 'audio',
            name: 'voice.ogg',
            mime: 'audio/ogg',
            bytes: 1000,
            url: 'https://shelf.example/v.ogg',
            tg_file_unique_id: null,
            caption: null,
          }))
        return { rows: out }
      }
      throw new Error(`unexpected statement: ${q.slice(0, 70)}`)
    },
  }
}

const OLD = new Date('2026-09-01T10:00:00Z')
const AFTER_FIX = new Date('2026-09-20T12:00:00Z')
const NOW = new Date('2026-09-20T15:00:00Z')

describe('the backlog of unread recordings', () => {
  it('asks again for what was judged before the fault was fixed', async () => {
    const { transcribeBacklogOnce, BATCH } = await import(
      './transcribe-backlog'
    )
    const rows: Row[] = []
    for (let i = 0; i < BATCH + 3; i++) {
      rows.push({
        id: 100 + i,
        owner_id: OWNER,
        at: new Date(Date.parse('2026-09-10T00:00:00Z') + i * 86400_000),
        transcribed_at: OLD,
      })
    }
    const pool = poolOf(rows)
    const r = await transcribeBacklogOnce(pool as never, NOW)
    expect(r.reopened).toBe(BATCH)
    expect(r.described).toBe(BATCH)
    expect(r.left).toBe(3)
  })

  /*
   * THE CUT-OFF IS IN THE SQL, AND THE DOUBLE CANNOT SEE IT.
   *
   * The pool above filters in JavaScript, so it would behave the same with the
   * `transcribed_at < $1` clause removed -- and it did: that mutation survived
   * every other test here. Without a real database the honest guard is the
   * statement itself.
   */
  it('asks the database for the cut-off, in both statements', async () => {
    const { transcribeBacklogOnce, BROKEN_UNTIL } = await import(
      './transcribe-backlog'
    )
    const seen: Array<{ q: string; p: unknown[] }> = []
    const pool = {
      async query(sql: string, params: unknown[] = []) {
        seen.push({ q: sql.replace(/\s+/g, ' '), p: params })
        if (/count\(\*\)/.test(sql)) return { rows: [{ n: 1 }] }
        return { rows: [] }
      },
    }
    await transcribeBacklogOnce(pool as never, NOW)
    const reads = seen.filter(x => /FROM user_media/.test(x.q))
    expect(reads.length, 'it never read the table').toBeGreaterThanOrEqual(2)
    for (const r of reads) {
      expect(r.q).toMatch(/transcribed_at < \$1/)
      expect(r.p[0]).toEqual(BROKEN_UNTIL)
    }
  })

  /*
   * A RECORDING JUDGED AFTER THE FIX KEEPS ITS VERDICT. Some really are
   * silence or music, and re-reading those for ever is a loop that spends
   * money to learn the same nothing.
   */
  it('leaves alone what was judged after the fix', async () => {
    const { transcribeBacklogOnce } = await import('./transcribe-backlog')
    const pool = poolOf([
      { id: 200, owner_id: OWNER, at: new Date(), transcribed_at: AFTER_FIX },
    ])
    const r = await transcribeBacklogOnce(pool as never, NOW)
    expect(r.reopened).toBe(0)
    expect(r.left).toBe(0)
    expect(transcribed).toHaveLength(0)
  })

  /*
   * NEWEST FIRST. What somebody said last week shapes an answer today; what
   * they said years ago mostly does not. If the backlog is never fully
   * drained, the part that gets read is the part worth reading.
   */
  it('takes the newest recordings first', async () => {
    const { transcribeBacklogOnce } = await import('./transcribe-backlog')
    const pool = poolOf([
      {
        id: 1,
        owner_id: OWNER,
        at: new Date('2019-01-01'),
        transcribed_at: OLD,
      },
      {
        id: 2,
        owner_id: OWNER,
        at: new Date('2026-09-18'),
        transcribed_at: OLD,
      },
      {
        id: 3,
        owner_id: OWNER,
        at: new Date('2026-09-19'),
        transcribed_at: OLD,
      },
    ])
    await transcribeBacklogOnce(pool as never, NOW)
    expect(transcribed[0].ids).toEqual([3, 2, 1])
  })

  /*
   * MARKED BEFORE THE CALL, NOT AFTER. A process that dies mid-batch must
   * cost five re-reads, not an endless retry against a paid endpoint on every
   * tick for ever.
   */
  it('marks the batch before it asks', async () => {
    const { transcribeBacklogOnce } = await import('./transcribe-backlog')
    const pool = poolOf([
      {
        id: 7,
        owner_id: OWNER,
        at: new Date('2026-09-19'),
        transcribed_at: OLD,
      },
    ])
    await transcribeBacklogOnce(pool as never, NOW)
    expect(pool.marked).toEqual([[7]])
    expect(pool.rows[0].transcribed_at).toEqual(NOW)
  })

  /*
   * ONE OWNER AT A TIME. A transcript belongs to the correspondence of exactly
   * one person; one call carrying two owners would write somebody's words into
   * another person's memory.
   */
  it('never mixes two owners into one call', async () => {
    const { transcribeBacklogOnce } = await import('./transcribe-backlog')
    const pool = poolOf([
      {
        id: 10,
        owner_id: OWNER,
        at: new Date('2026-09-19'),
        transcribed_at: OLD,
      },
      {
        id: 11,
        owner_id: '900000702',
        at: new Date('2026-09-18'),
        transcribed_at: OLD,
      },
    ])
    await transcribeBacklogOnce(pool as never, NOW)
    expect(transcribed).toHaveLength(2)
    expect(new Set(transcribed.map(t => t.owner)).size).toBe(2)
  })

  /*
   * AN UNREADABLE TABLE IS NOT AN EMPTY BACKLOG. It reports nothing done
   * rather than a comfortable zero left.
   */
  it('says nothing was done when it could not look', async () => {
    const { transcribeBacklogOnce } = await import('./transcribe-backlog')
    const broken = {
      query: async () => {
        throw new Error('relation "user_media" does not exist')
      },
    }
    const r = await transcribeBacklogOnce(broken as never, NOW)
    expect(r).toEqual({ left: 0, reopened: 0, described: 0, mirrored: 0 })
  })
})
