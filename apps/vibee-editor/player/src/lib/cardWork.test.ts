import { describe, expect, it } from 'vitest'
import * as SPEC from '@/spec/kanban-card-chat.gen'
import {
  beePollS,
  commandHead,
  mergeRows,
  nextPollS,
  toolCount,
  workFrom,
  workQuery,
  type BeeRow,
  type BeeWork,
} from './cardWork'

const CID = '11111111-2222-4333-8444-555555555555'
const bee = (running = true, conversation = CID) => ({
  conversation,
  branch: 'queen/5673',
  model: 'glm-5.3',
  dispatchedAt: '2026-10-03T10:00:00Z',
  finishedAt: running ? null : '2026-10-03T10:20:00Z',
  outcome: running ? null : 'pr_opened',
  running,
})
const row = (seq: number, kind: BeeRow['kind'], text = `r${seq}`): BeeRow => ({
  seq,
  at: '2026-10-03T10:00:00Z',
  kind,
  text,
  ...(kind === 'tool' ? { tool: 'bash' } : {}),
})

describe('cardWork: the bee on a card, as the sheet keeps it', () => {
  it('polls fast only while the bee runs and the person watches', () => {
    expect(beePollS(true)).toBe(SPEC.BEE_POLL_S)
    expect(beePollS(false)).toBe(SPEC.BEE_IDLE_POLL_S)
    const work: BeeWork = {
      kind: 'bee',
      bee: bee(true),
      rows: [],
      next: 0,
      prose: false,
    }
    expect(nextPollS(work, true)).toBe(SPEC.BEE_POLL_S)
    expect(nextPollS(work, false)).toBe(SPEC.BEE_IDLE_POLL_S)
    expect(nextPollS({ ...work, bee: bee(false) }, true)).toBe(
      SPEC.BEE_IDLE_POLL_S
    )
    // No token on render: nothing to wait for, stop asking.
    expect(nextPollS({ kind: 'off' }, true)).toBeNull()
    expect(nextPollS({ kind: 'none' }, true)).toBe(SPEC.BEE_IDLE_POLL_S)
  })

  it('joins a thought split across two polls and skips rows already seen', () => {
    const had = [row(1, 'tool'), row(2, 'thought', 'first half')]
    const out = mergeRows(
      had,
      [row(2, 'thought', 'dup'), row(3, 'thought', 'second half')],
      false
    )
    expect(out.map(r => r.seq)).toEqual([1, 3])
    expect(out[1].text).toBe('first half second half')
    expect(mergeRows(had, [row(1, 'tool')], true).map(r => r.seq)).toEqual([1])
  })

  it('keeps only the newest BEE_ROWS_MAX rows and trims a long thought', () => {
    const many = Array.from({ length: SPEC.BEE_ROWS_MAX + 5 }, (_, i) =>
      row(i + 1, i % 2 ? 'result' : 'tool')
    )
    const out = mergeRows([], many, false)
    expect(out).toHaveLength(SPEC.BEE_ROWS_MAX)
    expect(out[out.length - 1].seq).toBe(SPEC.BEE_ROWS_MAX + 5)
    const long = 'x'.repeat(SPEC.BEE_THOUGHT_MAX)
    const joined = mergeRows(
      [row(1, 'thought', long)],
      [row(2, 'thought', 'tail')],
      false
    )
    expect(joined[0].text.length).toBe(SPEC.BEE_THOUGHT_MAX)
    expect(joined[0].text.startsWith('…')).toBe(true)
    expect(joined[0].text.endsWith('tail')).toBe(true)
  })

  it('says off for no token or an old render, never "no bee"', () => {
    const reading: BeeWork = { kind: 'reading' }
    expect(workFrom(reading, 503, { configured: false }).kind).toBe('off')
    expect(workFrom(reading, 404, null).kind).toBe('off')
    expect(workFrom(reading, 200, { configured: false }).kind).toBe('off')
    expect(workFrom(reading, 0, null).kind).toBe('unmeasured')
    expect(
      workFrom(reading, 200, { configured: true, measured: false }).kind
    ).toBe('unmeasured')
    expect(
      workFrom(reading, 200, { configured: true, measured: true, bee: null })
        .kind
    ).toBe('none')
  })

  it('a missed read keeps the rows seen and marks them stale', () => {
    const had: BeeWork = {
      kind: 'bee',
      bee: bee(),
      rows: [row(1, 'tool')],
      next: 1,
      prose: false,
    }
    const out = workFrom(had, 502, null)
    expect(out.kind).toBe('bee')
    if (out.kind !== 'bee') return
    expect(out.stale).toBe(true)
    expect(out.rows).toEqual(had.rows)
    // The next good read clears it.
    const back = workFrom(out, 200, {
      configured: true,
      measured: true,
      bee: bee(),
      rows: [row(2, 'result')],
      next: 2,
    })
    expect(back.kind === 'bee' && back.stale).toBeFalsy()
    expect(back.kind === 'bee' && back.rows.map(r => r.seq)).toEqual([1, 2])
  })

  it('a new attempt or a reset starts the list over', () => {
    const had: BeeWork = {
      kind: 'bee',
      bee: bee(),
      rows: [row(1, 'tool'), row(2, 'result')],
      next: 2,
      prose: false,
    }
    const other = '99999999-2222-4333-8444-555555555555'
    const fresh = workFrom(had, 200, {
      configured: true,
      measured: true,
      bee: bee(true, other),
      rows: [row(1, 'tool', 'new')],
      next: 1,
    })
    expect(fresh.kind === 'bee' && fresh.rows.map(r => r.text)).toEqual(['new'])
    expect(fresh.kind === 'bee' && fresh.next).toBe(1)
    const reset = workFrom(had, 200, {
      configured: true,
      measured: true,
      reset: true,
      bee: bee(),
      rows: [row(1, 'tool', 'again')],
      next: 1,
    })
    expect(reset.kind === 'bee' && reset.rows.map(r => r.text)).toEqual([
      'again',
    ])
    // Rows of an unknown kind or shape are dropped, not drawn.
    const odd = workFrom(had, 200, {
      configured: true,
      measured: true,
      bee: bee(),
      rows: [{ seq: 3, kind: 'say', text: 'x' }, { seq: 'x' }, row(4, 'error')],
      next: 4,
    })
    expect(odd.kind === 'bee' && odd.rows.map(r => r.seq)).toEqual([1, 2, 4])
  })

  it('asks from where the sheet is, on its own attempt', () => {
    const task = 'gHashTag/t27#5673'
    expect(workQuery(task, { kind: 'reading' })).toBe(
      new URLSearchParams({ [SPEC.FIELD]: task }).toString()
    )
    const q = new URLSearchParams(
      workQuery(task, {
        kind: 'bee',
        bee: bee(),
        rows: [],
        next: 42,
        prose: false,
      })
    )
    expect(q.get(SPEC.FIELD)).toBe(task)
    expect(q.get('conversation')).toBe(CID)
    expect(q.get('since')).toBe('42')
  })

  it('picks out the CLI a command starts with, and counts the calls', () => {
    expect(commandHead('tri card 5673')).toBe('tri')
    expect(commandHead('  ./target/release/t27c parse x')).toBe('t27c')
    expect(commandHead('git status')).toBe('git')
    expect(commandHead('ls -la')).toBeNull()
    expect(commandHead('')).toBeNull()
    expect(toolCount([row(1, 'tool'), row(2, 'result'), row(3, 'tool')])).toBe(
      2
    )
  })
})
