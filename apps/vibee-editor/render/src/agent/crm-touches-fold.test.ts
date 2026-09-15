/**
 * THE FOLD, WHERE IT ACTUALLY RUNS.
 *
 * crm-supersede.test.ts proves the fold is correct as a function. This proves
 * the five reads in crm-touches.ts USE it -- which is a separate claim, and the
 * one that broke first: a mutation removing `effectiveTouches` from
 * `touchedSince` left every supersede test green, because none of them touched
 * the query layer. A guard nothing can fail is not a guard.
 *
 * The pool is a double that answers by matching the SQL, so a query that stops
 * selecting `reverts_id` fails here rather than silently folding nothing.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  touchedSince,
  touchesByLead,
  touchesFor,
  forgetTouchTable,
} from './crm-touches'

interface Row {
  id: number
  lead_id: string
  kind: string
  at: string
  note?: string | null
  reverts_id?: number | null
}

const OWNER = '144022504'
const LEAD = '900000001'
const at = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString()

/**
 * A pool that serves one table.
 *
 * It refuses to answer a SELECT that does not ask for the columns the fold
 * needs: without `id` and `reverts_id` the fold cannot see a correction, and
 * the failure would otherwise look like "corrections do not work" rather than
 * "the query stopped selecting them".
 */
function poolOf(rows: Row[]) {
  return {
    async query(sql: string) {
      const text = String(sql)
      if (/CREATE|ALTER|INDEX/i.test(text)) return { rows: [] }
      if (/FROM crm_touches/i.test(text)) {
        if (!/\bid\b/.test(text) || !/reverts_id/.test(text)) {
          throw new Error(
            'a read of crm_touches must select id and reverts_id, or the fold is blind'
          )
        }
        return { rows }
      }
      return { rows: [] }
    },
  } as never
}

beforeEach(() => forgetTouchTable())

describe('touchedSince returns the latest act that still stands', () => {
  it('skips a cancelled refusal and the row that cancelled it', async () => {
    // Newest first, as the query orders them.
    const rows: Row[] = [
      { id: 3, lead_id: LEAD, kind: 'refused', at: at(1), reverts_id: 2 },
      { id: 2, lead_id: LEAD, kind: 'refused', at: at(2), reverts_id: null },
      { id: 1, lead_id: LEAD, kind: 'replied', at: at(9), reverts_id: null },
    ]
    const got = await touchedSince(poolOf(rows), OWNER, 60)
    expect(got.get(LEAD)?.kind).toBe('replied')
  })

  it('reports an ordinary latest touch unchanged', async () => {
    const rows: Row[] = [
      { id: 2, lead_id: LEAD, kind: 'later', at: at(1), reverts_id: null },
      { id: 1, lead_id: LEAD, kind: 'written', at: at(5), reverts_id: null },
    ]
    const got = await touchedSince(poolOf(rows), OWNER, 60)
    expect(got.get(LEAD)?.kind).toBe('later')
  })

  it('leaves a lead out entirely when everything about them was cancelled', async () => {
    const rows: Row[] = [
      { id: 2, lead_id: LEAD, kind: 'refused', at: at(1), reverts_id: 1 },
      { id: 1, lead_id: LEAD, kind: 'refused', at: at(3), reverts_id: null },
    ]
    const got = await touchedSince(poolOf(rows), OWNER, 60)
    expect(got.has(LEAD)).toBe(false)
  })

  it('folds each lead on its own', async () => {
    const other = '900000002'
    const rows: Row[] = [
      { id: 4, lead_id: LEAD, kind: 'refused', at: at(1), reverts_id: 3 },
      { id: 3, lead_id: LEAD, kind: 'refused', at: at(2), reverts_id: null },
      { id: 2, lead_id: other, kind: 'refused', at: at(2), reverts_id: null },
      { id: 1, lead_id: LEAD, kind: 'written', at: at(8), reverts_id: null },
    ]
    const got = await touchedSince(poolOf(rows), OWNER, 60)
    expect(got.get(LEAD)?.kind).toBe('written')
    expect(got.get(other)?.kind).toBe('refused')
  })
})

describe('touchesByLead feeds stageOf only what still stands', () => {
  it('drops the cancelled refusal from the history', async () => {
    const rows: Row[] = [
      { id: 3, lead_id: LEAD, kind: 'refused', at: at(1), reverts_id: 2 },
      { id: 2, lead_id: LEAD, kind: 'refused', at: at(2), reverts_id: null },
      { id: 1, lead_id: LEAD, kind: 'replied', at: at(9), reverts_id: null },
    ]
    const got = await touchesByLead(poolOf(rows), OWNER)
    expect(got.get(LEAD)?.map(t => t.kind)).toEqual(['replied'])
  })
})

describe('the card reads the log raw, on purpose', () => {
  it('keeps both the mistake and its correction, with the pointer', async () => {
    const rows: Row[] = [
      {
        id: 3,
        lead_id: LEAD,
        kind: 'refused',
        at: at(1),
        note: null,
        reverts_id: 2,
      },
      {
        id: 2,
        lead_id: LEAD,
        kind: 'refused',
        at: at(2),
        note: null,
        reverts_id: null,
      },
    ]
    const got = await touchesFor(poolOf(rows), OWNER, LEAD)
    // Folding here would tidy the mistake away, which is the opposite of what a
    // card is for: it must show the struck-through refusal and who lifted it.
    expect(got).toHaveLength(2)
    expect(got[0].revertsId).toBe(2)
    expect(got[1].id).toBe(2)
  })
})

/**
 * AND THE LATEST ACT, NOT MERELY THE LATEST ROW.
 *
 * This map is the single `touch` behind three decisions that choose the
 * queue: the score penalty, the veto on next='talk', and refusedLately in
 * segmentOf. All three branch on `kind`, and none has a branch for `note`.
 *
 * So a note written on somebody who had refused made that refusal invisible
 * to every one of them -- while the stage, read from the full history, still
 * said 'refused'. One card, two answers. The fold alone did not help: a note
 * is not a correction, so effectiveTouches passes it straight through.
 */
describe('a note does not become the latest touch', () => {
  it('reports the act under the note', async () => {
    const rows: Row[] = [
      {
        id: 3,
        lead_id: LEAD,
        kind: 'note',
        at: '2026-09-10',
        reverts_id: null,
      },
      {
        id: 2,
        lead_id: LEAD,
        kind: 'refused',
        at: '2026-09-08',
        reverts_id: null,
      },
    ]
    const got = await touchedSince(poolOf(rows), OWNER, 60)
    expect(got.get(LEAD)?.kind, 'the refusal disappeared behind a note').toBe(
      'refused'
    )
  })

  it('reports nothing for somebody who has only been noted', async () => {
    const rows: Row[] = [
      {
        id: 1,
        lead_id: LEAD,
        kind: 'note',
        at: '2026-09-10',
        reverts_id: null,
      },
    ]
    const got = await touchedSince(poolOf(rows), OWNER, 60)
    expect(got.get(LEAD)).toBeUndefined()
  })

  it('still folds a correction away under the note', async () => {
    // Both rules apply, in order: cancel first, then look past the note.
    const rows: Row[] = [
      {
        id: 4,
        lead_id: LEAD,
        kind: 'note',
        at: '2026-09-12',
        reverts_id: null,
      },
      {
        id: 3,
        lead_id: LEAD,
        kind: 'refused',
        at: '2026-09-11',
        reverts_id: 2,
      },
      {
        id: 2,
        lead_id: LEAD,
        kind: 'refused',
        at: '2026-09-08',
        reverts_id: null,
      },
      {
        id: 1,
        lead_id: LEAD,
        kind: 'written',
        at: '2026-09-01',
        reverts_id: null,
      },
    ]
    const got = await touchedSince(poolOf(rows), OWNER, 60)
    expect(got.get(LEAD)?.kind).toBe('written')
  })
})
