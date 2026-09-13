/**
 * DUET RUNS SURVIVE A RESTART: persisted at start, per turn, at finish.
 * Spec: t27 specs/automation/crm-client-workspace.t27
 *
 * Before 2026-09-13 a run lived in a Map and a deploy emptied
 * `crm_duet_status`. Now `persist(run)` writes the table and the status falls
 * back to it; a run still `running` after 30 minutes is shown as `lost`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  runDuet,
  viewOf,
  rowToRun,
  findRun,
  listRuns,
  summaryOf,
  upsertRun,
  forgetRunsTableForTests,
  LOST_AFTER_MS,
  type DuetRun,
  type DuetDeps,
} from './src/agent/crm-duet-tool'
import type { ToolContext } from './src/agent/tools'

const OWNER = '144022504'
const BUYER = '435572800'
const ctx = { telegramId: OWNER, pool: {} } as unknown as ToolContext

function freshRun(over: Partial<DuetRun> = {}): DuetRun {
  return {
    id: 'duet-persist',
    buyer: BUYER,
    owner: OWNER,
    turns: 2,
    dry_run: true,
    state: 'running',
    started_at: new Date(0).toISOString(),
    transcript: [],
    coverage: {},
    paid_calls: 0,
    media_sent: 0,
    violations: [],
    voice_flags: [],
    ...over,
  }
}

const text = (t: string) => ({ ['тип']: 'текст', ['текст']: t }) // cyrillic-ok: pre-existing event envelope

function deps(persist: DuetDeps['persist']): DuetDeps {
  let s = 0
  const script = [[text('Здравствуйте! Где ваша аудитория?')], [text('Понял, вот план.')]]
  return {
    agent: () =>
      (async function* () {
        for (const e of script[s++] ?? []) yield e as never
      })(),
    buyerModel: async () => 'В телеграме.',
    sendText: async () => undefined,
    sendMedia: async () => undefined,
    clientProfile: async () => ({ has_profile: false }),
    persist,
    now: () => 1000,
  }
}

beforeEach(() => forgetRunsTableForTests())

describe('persist', () => {
  it('is called at start, after every turn and at finish, with the growing run', async () => {
    const snapshots: Array<{ state: string; lines: number }> = []
    const run = freshRun()
    await runDuet(run, ctx, deps(async r => {
      snapshots.push({ state: r.state, lines: r.transcript.length })
    }))
    expect(run.state).toBe('done')
    // start (0 lines) + 4 turns + finish
    expect(snapshots).toEqual([
      { state: 'running', lines: 0 },
      { state: 'running', lines: 1 },
      { state: 'running', lines: 2 },
      { state: 'running', lines: 3 },
      { state: 'running', lines: 4 },
      { state: 'done', lines: 4 },
    ])
  })

  it('a failing persist never fails the run', async () => {
    const run = freshRun()
    await runDuet(run, ctx, deps(async () => {
      throw new Error('table is gone')
    }))
    expect(run.state).toBe('done')
    expect(run.transcript.length).toBe(4)
  })

  it('upsertRun writes every field once and updates on conflict', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql: sql.replace(/\s+/g, ' '), params })
        return { rows: [] }
      },
    }
    await upsertRun(pool, freshRun({ coverage: { reel_render: { calls: 1, ok: 1, fail: 0 } } }))
    expect(calls[0].sql).toMatch(/CREATE TABLE IF NOT EXISTS crm_duet_runs/)
    expect(calls[1].sql).toMatch(/CREATE INDEX IF NOT EXISTS crm_duet_runs_buyer/)
    const ins = calls[2]
    expect(ins.sql).toMatch(/INSERT INTO crm_duet_runs .* ON CONFLICT \(id\) DO UPDATE/)
    expect(ins.params.slice(0, 3)).toEqual(['duet-persist', OWNER, BUYER])
    expect(ins.params[11]).toBe(JSON.stringify({ reel_render: { calls: 1, ok: 1, fail: 0 } }))
  })
})

describe('status falls back to the table', () => {
  const row = {
    id: 'duet-old',
    owner_id: OWNER,
    buyer_id: BUYER,
    state: 'done',
    dry_run: false,
    turns: 4,
    started_at: new Date(5000).toISOString(),
    finished_at: new Date(9000).toISOString(),
    paid_calls: 1,
    media_sent: 1,
    profile_used: true,
    coverage: { reel_render: { calls: 1, ok: 1, fail: 0 } },
    violations: [],
    voice_flags: ['turn 0: x'],
    transcript: [{ i: 0, from: 'seller', text: 'hi', sent: true }],
    error: null,
  }

  it('rowToRun restores the run shape', () => {
    const run = rowToRun(row)
    expect(run).toMatchObject({ id: 'duet-old', buyer: BUYER, owner: OWNER, state: 'done', paid_calls: 1, profile_used: true })
    expect(run.transcript.length).toBe(1)
    expect(run.coverage.reel_render.ok).toBe(1)
  })

  it('findRun reads the table when the Map has nothing, by id and as the latest', async () => {
    const seen: string[] = []
    const pool = {
      query: async (sql: string) => {
        seen.push(sql.replace(/\s+/g, ' '))
        return /SELECT/.test(sql) ? { rows: [row] } : { rows: [] }
      },
    }
    const byId = await findRun(pool, OWNER, 'duet-old')
    expect(byId?.id).toBe('duet-old')
    expect(seen.some(s => /WHERE id = \$1 AND owner_id = \$2/.test(s))).toBe(true)
    const latest = await findRun(pool, OWNER, null)
    expect(latest?.id).toBe('duet-old')
    expect(seen.some(s => /WHERE owner_id = \$1 ORDER BY started_at DESC LIMIT 1/.test(s))).toBe(true)
  })

  it('a pool without the table (or without query) yields not found, not an error', async () => {
    expect(await findRun({} as never, OWNER, 'x')).toBeUndefined()
    expect(await findRun({ query: async () => { throw new Error('no table') } }, OWNER, 'x')).toBeUndefined()
    expect(await listRuns({} as never, OWNER, null, 10)).toEqual([])
  })

  it('listRuns scopes to the owner and the buyer, and carries `lines` instead of the transcript', async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = []
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        seen.push({ sql: sql.replace(/\s+/g, ' '), params })
        return /SELECT/.test(sql) ? { rows: [{ ...row, transcript: undefined, lines: 8 }] } : { rows: [] }
      },
    }
    const runs = await listRuns(pool, OWNER, BUYER, 10)
    const q = seen.find(s => /SELECT/.test(s.sql))!
    expect(q.sql).toMatch(/WHERE owner_id = \$1 AND buyer_id = \$2/)
    expect(q.params).toEqual([OWNER, BUYER, 10])
    expect(summaryOf(runs[0], 10_000)).toMatchObject({ id: 'duet-old', buyer: BUYER, state: 'done', lines: 8, finished_at: row.finished_at })
    expect('transcript' in summaryOf(runs[0])).toBe(false)
  })
})

describe('lost is derived on read', () => {
  it('a running run older than 30 minutes reads as lost; the stored state stays running', () => {
    const run = freshRun({ started_at: new Date(0).toISOString() })
    expect(viewOf(run, LOST_AFTER_MS + 1).state).toBe('lost')
    expect(viewOf(run, LOST_AFTER_MS - 1).state).toBe('running')
    expect(run.state).toBe('running')
    expect(viewOf(freshRun({ state: 'done' }), LOST_AFTER_MS * 10).state).toBe('done')
    expect(summaryOf(run, LOST_AFTER_MS * 2).state).toBe('lost')
  })
})
