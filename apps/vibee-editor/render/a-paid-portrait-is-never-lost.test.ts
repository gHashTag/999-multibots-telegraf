/**
 * A PORTRAIT THAT WAS PAID FOR IS NEVER LOST, AND NEVER PAID FOR TWICE.
 *
 * Production, 2026-09-21T06:33Z: the CRM gift -- GPT Image 2.5 edit on Kie,
 * the lead's avatar, 9:16 -- was reported "Kie did not answer within the
 * allotted time... credits already charged". Asked later, Kie said the task
 * had succeeded after 380 s. The turn waited 180 s, called it a failure, and
 * the seller moved on to other content: every portrait slower than three
 * minutes was paid for, drawn and thrown away.
 *
 * What this pins, against a crm_owed double that reads its SQL
 * (crm-owed-double.ts) and a drawing tool that counts tasks and charges:
 *
 *   - the Kie layer: a timeout is `pending` with the task id, one createTask;
 *   - the watch: one per task, bounded, stores the picture once;
 *   - the turn: a slow portrait is "being drawn", not "failed"; the debt keeps
 *     the task id; the watch puts the finished picture on the debt; the next
 *     delivery hands it over -- no second task, no second charge;
 *   - the next attempt after a redeploy asks the stored id FIRST;
 *   - a debt written before the id had a column is recovered from its words;
 *   - the owner's rescue runs the same path and never creates a task;
 *   - the queue does not chase a portrait still drawing, and hands over a
 *     finished one even while the provider looks down;
 *   - the turn's wait fits the sweep's step budget.
 *
 * Ids are synthetic (9000000xx); the task ids are made up.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { owedDouble, type OwedDouble } from './crm-owed-double'

import {
  OWNER,
  LEAD,
  TASK,
  TASK2,
  AVATAR,
  PROVIDER,
  KEPT,
  flush,
  deliverySetup,
} from './crm-deliver-harness'

/*
 * Every case re-imports the tool graph after resetModules. Cold, on a shared
 * machine, that alone took over vitest's 5 s default (measured 2026-09-22:
 * 19 s wall for 6 s of CPU) -- a flaky neighbour teaches people to re-run.
 */
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  vi.resetModules()
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost'
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('./src/agent/crm-offer-tool')
  vi.doUnmock('./src/agent/telegram-tools')
  vi.doUnmock('./src/agent/crm-touch-tools')
  vi.doUnmock('./src/agent/chat-memory')
})

// ─── the Kie layer ──────────────────────────────────────────────────────────

describe('kie-image: a timeout is pending, with the id, after ONE task', () => {
  it('stops waiting, keeps the task id, and never creates a second task', async () => {
    vi.useFakeTimers()
    process.env.KIE_AI_API_KEY = 'test-key'
    const hits: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        hits.push(u.replace(/^https:\/\/api\.kie\.ai\/api\/v1/, ''))
        const json = /createTask/.test(u)
          ? { data: { taskId: TASK } }
          : /recordInfo/.test(u)
            ? { data: { state: 'generating' } }
            : { data: 100 }
        return { status: 200, text: async () => JSON.stringify(json) }
      })
    )
    const { editImage } = await import('./src/kie-image')
    const run = editImage({
      prompt: 'p',
      imageUrl: AVATAR,
      model: 'gpt-image-2-5-flare-image-to-image',
      timeoutMs: 8_000,
    })
    await vi.advanceTimersByTimeAsync(12_000)
    const r = await run
    expect(r.ok).toBe(false)
    expect(!r.ok && r.pending, 'a timeout is not a refusal').toBe(true)
    expect(r.taskId).toBe(TASK)
    expect(hits.filter(h => /createTask/.test(h)).length).toBe(1)
    expect(hits.filter(h => /recordInfo/.test(h)).length).toBe(2)
  })

  /*
   * THE ID LEAVES WITH THE TASK. Returned only when the wait ended, it left a
   * minute in which a second request found nothing and paid again, and a
   * render killed in that minute took the only copy of the id with it.
   */
  it('tells the caller the task id right after createTask, before the wait', async () => {
    vi.useFakeTimers()
    process.env.KIE_AI_API_KEY = 'test-key'
    const order: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (/createTask/.test(u)) order.push('createTask')
        if (/recordInfo/.test(u)) order.push('recordInfo')
        const json = /createTask/.test(u)
          ? { data: { taskId: TASK } }
          : /recordInfo/.test(u)
            ? { data: { state: 'generating' } }
            : { data: 100 }
        return { status: 200, text: async () => JSON.stringify(json) }
      })
    )
    const { editImage } = await import('./src/kie-image')
    const run = editImage({
      prompt: 'p',
      imageUrl: AVATAR,
      model: 'gpt-image-2-5-flare-image-to-image',
      timeoutMs: 8_000,
      onCreated: id => {
        order.push(`told ${id}`)
        // A failing note must not lose the task.
        throw new Error('the debt table is down')
      },
    })
    await vi.advanceTimersByTimeAsync(12_000)
    const r = await run
    expect(order.slice(0, 3)).toEqual([
      'createTask',
      `told ${TASK}`,
      'recordInfo',
    ])
    expect(!r.ok && r.pending).toBe(true)
    expect(r.taskId).toBe(TASK)
  })

  it('a refusal by the provider is NOT pending', async () => {
    vi.useFakeTimers()
    process.env.KIE_AI_API_KEY = 'test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const json = /createTask/.test(url)
          ? { data: { taskId: TASK } }
          : /recordInfo/.test(url)
            ? { data: { state: 'fail', failMsg: 'nsfw' } }
            : { data: 100 }
        return { status: 200, text: async () => JSON.stringify(json) }
      })
    )
    const { editImage } = await import('./src/kie-image')
    const run = editImage({ prompt: 'p', imageUrl: AVATAR, timeoutMs: 60_000 })
    await vi.advanceTimersByTimeAsync(5_000)
    const r = await run
    expect(r.ok).toBe(false)
    expect(!r.ok && r.pending).toBeFalsy()
    expect(!r.ok && r.reason).toContain('nsfw')
  })

  it('kieTaskState reads one recordInfo: success, fail, running', async () => {
    process.env.KIE_AI_API_KEY = 'test-key'
    const answers = [
      {
        data: {
          state: 'success',
          resultJson: JSON.stringify({ resultUrls: [PROVIDER] }),
        },
      },
      { data: { state: 'fail', failMsg: 'bad input' } },
      { data: { state: 'generating' } },
    ]
    const f = vi.fn(async () => ({
      status: 200,
      text: async () => JSON.stringify(answers.shift()),
    }))
    vi.stubGlobal('fetch', f)
    const { kieTaskState } = await import('./src/kie-image')
    expect(await kieTaskState(TASK)).toEqual({
      state: 'success',
      taskId: TASK,
      url: PROVIDER,
    })
    expect(await kieTaskState(TASK)).toMatchObject({ state: 'fail' })
    expect(await kieTaskState(TASK)).toEqual({ state: 'running', taskId: TASK })
    // Not an id at all: refused before the wire.
    expect((await kieTaskState('../../x')).state).toBe('unknown')
    expect(f).toHaveBeenCalledTimes(3)
  })

  it('an old refusal names its task only in words, and the words are enough', async () => {
    const { kieTaskIdIn } = await import('./src/kie-image')
    expect(
      kieTaskIdIn(
        'Kie не ответил за отведённое время. Задача может ещё выполняться — ' + // cyrillic-ok: the old refusal text
          `кредиты уже списаны, id задачи ${TASK}` // cyrillic-ok: the old refusal text
      )
    ).toBe(TASK)
    expect(kieTaskIdIn('HTTP 403 Exhausted balance')).toBeNull()
    // 33 hex digits are not a task id.
    expect(kieTaskIdIn(TASK + 'a')).toBeNull()
  })
})

// ─── the watch ──────────────────────────────────────────────────────────────

describe('late-picture: one watch per task, bounded, stored once', () => {
  it('two callers share one watch; the file is copied once', async () => {
    const late = await import('./src/agent/late-picture')
    const states = ['running', 'running', 'success']
    const check = vi.fn(async (id: string) =>
      states.shift() === 'success'
        ? { state: 'success' as const, taskId: id, url: PROVIDER }
        : { state: 'running' as const, taskId: id }
    )
    const keep = vi.fn(async () => KEPT)
    const deps = { check, keep, sleep: async () => undefined }
    const a = late.watchLate(TASK, deps)
    const b = late.watchLate(TASK, deps)
    expect(a).toBe(b)
    expect(late.isWatching(TASK)).toBe(true)
    expect(await a).toEqual({ state: 'ready', taskId: TASK, url: KEPT })
    expect(check).toHaveBeenCalledTimes(3)
    expect(keep).toHaveBeenCalledTimes(1)
    expect(late.isWatching(TASK)).toBe(false)
    // Asked again later: answered from what was kept, nothing re-copied.
    expect(await late.lookOnce(TASK, deps)).toMatchObject({ state: 'ready' })
    expect(keep).toHaveBeenCalledTimes(1)
  })

  it('stops at the bound and says running, so the stored id carries on', async () => {
    const late = await import('./src/agent/late-picture')
    let t = 0
    const out = await late.watchLate(
      TASK2,
      {
        check: async id => ({ state: 'running', taskId: id }),
        keep: async () => KEPT,
        sleep: async ms => {
          t += ms
        },
        now: () => t,
      },
      { boundMs: 60_000, everyMs: 15_000 }
    )
    expect(out.state).toBe('running')
    expect(t).toBe(60_000)
  })

  it('a copy that failed is not "ready" -- it is tried again', async () => {
    const late = await import('./src/agent/late-picture')
    const keep = vi.fn().mockResolvedValueOnce('').mockResolvedValueOnce(KEPT)
    const deps = {
      check: async (id: string) => ({
        state: 'success' as const,
        taskId: id,
        url: PROVIDER,
      }),
      keep,
    }
    expect((await late.lookOnce(TASK2, deps)).state).toBe('running')
    expect(await late.lookOnce(TASK2, deps)).toMatchObject({
      state: 'ready',
      url: KEPT,
    })
  })
})

// ─── the turn ───────────────────────────────────────────────────────────────

const openRow = (owed: OwedDouble) =>
  owed.rows.find(
    r => String(r.lead_id) === LEAD && String(r.owner_id) === OWNER
  )

describe('crm_deliver_photo: slower than the turn is not a failure', () => {
  it('pending -> watched -> ready -> handed over: one task, one charge', async () => {
    vi.useFakeTimers()
    const owed = owedDouble()
    const s = await deliverySetup({
      owed,
      plan: ['pending'],
      kie: ['running', 'success'],
    })

    // THE TURN: the portrait is still drawing when the wait ends.
    const first: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'captain at sunset' },
      s.ctx
    )
    expect(first.delivered).toBe(false)
    expect(first.pending).toBe(true)
    expect(first.task_id).toBe(TASK)
    expect(first['причина']).toBe(s.PORTRAIT_DRAWING) // cyrillic-ok: public API field
    expect(s.draw.ledger).toEqual({ tasks: 1, charges: 1 })
    // The wait handed to the drawing tool is the portrait's own, not 180 s.
    expect(s.draw.calls[0].waitMs).toBe(s.PORTRAIT_WAIT_MS)
    expect(s.q.pendingCount(), 'no card before there is a picture').toBe(0)
    // The debt holds the task: it outlives this process.
    expect(openRow(owed)).toMatchObject({ task_id: TASK, settled_at: null })
    expect(s.pool.journal.map(j => j.kind)).toEqual(['gift-late'])

    // AFTER THE TURN: the watch asks, the picture comes, it is stored once.
    await vi.advanceTimersByTimeAsync(15_000)
    await flush()
    expect(s.check).toHaveBeenCalledTimes(1)
    expect(openRow(owed)?.ready_url ?? null).toBeNull()
    await vi.advanceTimersByTimeAsync(15_000)
    await flush()
    expect(s.check).toHaveBeenCalledTimes(2)
    expect(s.keep).toHaveBeenCalledTimes(1)
    expect(openRow(owed)).toMatchObject({ ready_url: KEPT, settled_at: null })
    expect(s.pool.journal.map(j => j.kind)).toContain('gift-recovered')

    // THE NEXT DELIVERY: the finished portrait, not a new one.
    const second: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'captain at sunset' },
      s.ctx
    )
    expect(second.proposal).toBe(true)
    expect(second.recovered).toBe(true)
    expect(second.preview).toBe(KEPT)
    expect(s.q.pendingFor(OWNER)!.media).toEqual({ kind: 'photo', url: KEPT })
    expect(s.q.pendingFor(OWNER)!.charge).toBeUndefined()
    expect(
      s.draw.ledger,
      'a second task or charge for a portrait that exists'
    ).toEqual({
      tasks: 1,
      charges: 1,
    })
    // Handed over: the debt is settled.
    expect(openRow(owed)?.settled_at).not.toBeNull()
  })

  it('after a redeploy the stored id is asked FIRST, and a finished one is handed over', async () => {
    const owed = owedDouble()
    await owed.query(
      `CREATE TABLE IF NOT EXISTS crm_owed (owner_id text, lead_id text)`
    )
    await owed.query(
      `ALTER TABLE crm_owed ADD COLUMN IF NOT EXISTS task_id text, ADD COLUMN IF NOT EXISTS task_at timestamptz, ADD COLUMN IF NOT EXISTS ready_url text, ADD COLUMN IF NOT EXISTS ready_at timestamptz`
    )
    owed.rows.push({
      owner_id: OWNER,
      lead_id: LEAD,
      what: 'picture',
      why: 'still drawing',
      at: new Date('2026-09-21T06:33:00Z'),
      settled_at: null,
      task_id: TASK,
      task_at: new Date('2026-09-21T06:33:00Z'),
      ready_url: null,
      ready_at: null,
    })
    const s = await deliverySetup({ owed, kie: ['success'] })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'captain' },
      s.ctx
    )
    expect(s.check).toHaveBeenCalledWith(TASK)
    expect(r.recovered).toBe(true)
    expect(r.preview).toBe(KEPT)
    expect(s.draw.ledger).toEqual({ tasks: 0, charges: 0 })
    expect(openRow(owed)?.settled_at).not.toBeNull()
  })

  it('a portrait already paid for is charged to NOBODY, even on a paid call with an empty wallet', async () => {
    const owed = owedDouble()
    await owed.query(
      `CREATE TABLE IF NOT EXISTS crm_owed (owner_id text, lead_id text)`
    )
    await owed.query(
      `ALTER TABLE crm_owed ADD COLUMN IF NOT EXISTS task_id text, ADD COLUMN IF NOT EXISTS task_at timestamptz, ADD COLUMN IF NOT EXISTS ready_url text, ADD COLUMN IF NOT EXISTS ready_at timestamptz`
    )
    owed.rows.push({
      owner_id: OWNER,
      lead_id: LEAD,
      what: 'picture',
      why: 'drawn late',
      at: new Date('2026-09-21T06:33:00Z'),
      settled_at: null,
      task_id: TASK,
      task_at: new Date('2026-09-21T06:33:00Z'),
      ready_url: KEPT,
      ready_at: new Date('2026-09-21T06:40:00Z'),
    })
    const s = await deliverySetup({ owed, ownClient: true, balance: 0 })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x', gift: false },
      s.ctx
    )
    expect(
      r.proposal,
      'refused for a balance a finished portrait does not need'
    ).toBe(true)
    expect(r.preview).toBe(KEPT)
    expect(r.price).toBe(0)
    expect(s.q.pendingFor(OWNER)!.charge).toBeUndefined()
    expect(s.draw.ledger).toEqual({ tasks: 0, charges: 0 })
  })

  it('a stored task still drawing is waited for: no new task, no charge, no card', async () => {
    // The watches this starts must not run on into other tests.
    vi.useFakeTimers()
    const owed = owedDouble()
    const s0 = await deliverySetup({ owed, plan: ['pending'], kie: [] })
    await s0.deliver.handler({ chat: '@test_lead', prompt: 'x' }, s0.ctx)
    // The process "restarts": the watch is gone, the row is not.
    const late = await import('./src/agent/late-picture')
    late.forgetLatePicturesForTests()
    vi.resetModules()
    const s = await deliverySetup({ owed, kie: ['running'] })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x' },
      s.ctx
    )
    expect(r.pending).toBe(true)
    expect(r.task_id).toBe(TASK)
    expect(s.draw.ledger).toEqual({ tasks: 0, charges: 0 })
    expect(s.q.pendingCount()).toBe(0)
  })

  it('a stored task the provider refused is forgotten, and a new portrait is drawn', async () => {
    vi.useFakeTimers()
    const owed = owedDouble()
    const s0 = await deliverySetup({ owed, plan: ['pending'] })
    await s0.deliver.handler({ chat: '@test_lead', prompt: 'x' }, s0.ctx)
    const late = await import('./src/agent/late-picture')
    late.forgetLatePicturesForTests()
    vi.resetModules()
    const s = await deliverySetup({ owed, plan: ['done'], kie: ['fail'] })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x' },
      s.ctx
    )
    expect(s.draw.ledger).toEqual({ tasks: 1, charges: 1 })
    expect(r.proposal).toBe(true)
    expect(r.preview).toBe('https://s3.example/drawn-1.png')
  })

  it('a LEGACY debt -- id only in its words, table without the new columns -- is recovered', async () => {
    const owed = owedDouble({
      legacy: [
        {
          owner_id: OWNER,
          lead_id: LEAD,
          what: 'picture',
          why:
            'Kie не ответил за отведённое время. Задача может ещё выполняться — ' + // cyrillic-ok: the old refusal text
            `кредиты уже списаны, id задачи ${TASK}`, // cyrillic-ok: the old refusal text
          at: new Date('2026-09-21T06:33:00Z'),
          settled_at: null,
        },
      ],
    })
    const s = await deliverySetup({ owed, kie: ['success'] })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x' },
      s.ctx
    )
    expect(s.check).toHaveBeenCalledWith(TASK)
    expect(r.recovered).toBe(true)
    expect(r.preview).toBe(KEPT)
    expect(s.draw.ledger).toEqual({ tasks: 0, charges: 0 })
    // The columns the recovery needs were added before they were used.
    expect(owed.statements.some(x => /^ALTER TABLE crm_owed/.test(x))).toBe(
      true
    )
  })

  it('a legacy debt whose task failed loses the id from its words too', async () => {
    const owed = owedDouble({
      legacy: [
        {
          owner_id: OWNER,
          lead_id: LEAD,
          what: 'picture',
          why: `timeout, id задачи ${TASK}`, // cyrillic-ok: the old refusal text
          at: new Date('2026-09-21T06:33:00Z'),
          settled_at: null,
        },
      ],
    })
    const s = await deliverySetup({ owed, plan: ['done'], kie: ['fail'] })
    await s.deliver.handler({ chat: '@test_lead', prompt: 'x' }, s.ctx)
    // Settled by the new portrait's card; and the old id is gone from `why`,
    // so no later reader asks about the refused task again.
    expect(String(openRow(owed)?.why)).not.toContain(TASK)
    expect(s.draw.ledger.tasks).toBe(1)
  })
})

describe('crm_portrait_rescue: the lost one, by hand', () => {
  it('owner-only', async () => {
    const owed = owedDouble()
    const s = await deliverySetup({ owed })
    await expect(
      s.rescue.handler({ task_id: TASK, lead: LEAD }, s.ctx)
    ).rejects.toThrow()
  })

  it('stores the finished picture on the debt, even a settled one, without a task or a charge', async () => {
    process.env.OWNER_TELEGRAM_ID = OWNER
    vi.resetModules()
    const owed = owedDouble()
    const s = await deliverySetup({ owed, kie: ['success'] })
    const r: any = await s.rescue.handler(
      { task_id: TASK.toUpperCase(), lead: LEAD },
      s.ctx
    )
    expect(r.rescued).toBe(true)
    expect(r.url).toBe(KEPT)
    expect(openRow(owed)).toMatchObject({
      ready_url: KEPT,
      task_id: TASK,
      settled_at: null,
    })
    expect(s.draw.ledger).toEqual({ tasks: 0, charges: 0 })
    // And the next delivery hands it over.
    const d: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x' },
      s.ctx
    )
    expect(d.preview).toBe(KEPT)
    expect(s.draw.ledger).toEqual({ tasks: 0, charges: 0 })
    delete process.env.OWNER_TELEGRAM_ID
  })

  it('refuses what is not a task id before asking anybody', async () => {
    process.env.OWNER_TELEGRAM_ID = OWNER
    vi.resetModules()
    const owed = owedDouble()
    const s = await deliverySetup({ owed })
    const r: any = await s.rescue.handler(
      { task_id: 'not-a-task', lead: LEAD },
      s.ctx
    )
    expect(r.rescued).toBe(false)
    expect(s.check).not.toHaveBeenCalled()
    delete process.env.OWNER_TELEGRAM_ID
  })
})

// ─── one portrait at a time, and the id on the debt at once ────────────────

describe('a second request inside the wait does not pay again', () => {
  /*
   * The entry path is real: on 20.09 the bot gave up on a turn at its ceiling
   * and asked again while the first turn ran on, and the same picture was
   * charged twice. The drawing tool here takes the task and the charge at the
   * start of the call and answers after a gate -- the real order.
   */
  it('two overlapping deliveries: one task, one charge, the first task on the debt', async () => {
    vi.useFakeTimers()
    const owed = owedDouble()
    let open!: () => void
    const gate = new Promise<void>(r => (open = r))
    const s = await deliverySetup({ owed, plan: ['pending'], gate })
    const first = s.deliver.handler(
      { chat: '@test_lead', prompt: 'captain' },
      s.ctx
    ) as Promise<any>
    await flush()
    // Inside the wait: the task exists, is paid for, and is on the debt.
    expect(s.draw.ledger).toEqual({ tasks: 1, charges: 1 })
    expect(openRow(owed)).toMatchObject({ task_id: TASK, task_mode: 'gift' })
    const second: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'captain' },
      s.ctx
    )
    expect(second.pending).toBe(true)
    expect(second.task_id).toBe(TASK)
    expect(s.draw.ledger, 'the second request paid again').toEqual({
      tasks: 1,
      charges: 1,
    })
    open()
    const r = await first
    expect(r.pending).toBe(true)
    expect(openRow(owed)?.task_id).toBe(TASK)
    expect(s.draw.ledger).toEqual({ tasks: 1, charges: 1 })
  })

  /*
   * EARLIER STILL: the first request has not even reached Kie -- it is still
   * reading the face (the avatar comes through the owner's Telegram session
   * and takes seconds). There is no task and no debt yet, so only the claim
   * made at the door stops the second request from drawing too.
   */
  it('a second request while the first is still reading the face: one task', async () => {
    const owed = owedDouble()
    let open!: () => void
    const avatarGate = new Promise<void>(r => (open = r))
    const s = await deliverySetup({ owed, plan: ['done', 'done'], avatarGate })
    const first = s.deliver.handler(
      { chat: '@test_lead', prompt: 'captain' },
      s.ctx
    ) as Promise<any>
    await flush()
    expect(s.avatarAsked.length).toBe(1)
    expect(s.draw.ledger.tasks, 'no task yet').toBe(0)
    const second: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'captain' },
      s.ctx
    )
    expect(second.pending).toBe(true)
    open()
    const r = await first
    expect(r.proposal).toBe(true)
    expect(s.draw.ledger, 'both requests drew').toEqual({
      tasks: 1,
      charges: 1,
    })
  })

  it('a render killed inside the wait: the next one recovers the portrait from the debt', async () => {
    vi.useFakeTimers()
    const owed = owedDouble()
    const s0 = await deliverySetup({
      owed,
      plan: ['pending'],
      gate: new Promise(() => undefined), // never answers: the process dies
    })
    void s0.deliver.handler({ chat: '@test_lead', prompt: 'x' }, s0.ctx)
    await flush()
    expect(openRow(owed)?.task_id, 'the id died with the process').toBe(TASK)
    // A new process: new modules, no watch, no latch -- only the row.
    const late = await import('./src/agent/late-picture')
    late.forgetLatePicturesForTests()
    vi.resetModules()
    const s = await deliverySetup({ owed, kie: ['success'] })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x' },
      s.ctx
    )
    expect(s.check).toHaveBeenCalledWith(TASK)
    expect(r.recovered).toBe(true)
    expect(r.preview).toBe(KEPT)
    expect(s.draw.ledger).toEqual({ tasks: 0, charges: 0 })
  })

  it('a task Kie refused inside the wait does not stay on the debt', async () => {
    const owed = owedDouble()
    const s = await deliverySetup({ owed, plan: ['fail'] })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x' },
      s.ctx
    )
    expect(r.delivered).toBe(false)
    // Still owed a picture, but not by that task.
    expect(openRow(owed)).toMatchObject({ settled_at: null, task_id: null })
  })
})

// ─── a settled debt reopened is a NEW promise ──────────────────────────────

describe('a debt reopened after it was settled carries nothing of the old one', () => {
  it('settled with a portrait, reopened by a new refusal: a new portrait is drawn, not the old one', async () => {
    const owed = owedDouble()
    const s = await deliverySetup({ owed, plan: ['done'] })
    const debts = await import('./src/agent/crm-owed')
    await debts.ensureOwedTable(owed as never)
    owed.rows.push({
      owner_id: OWNER,
      lead_id: LEAD,
      what: 'picture',
      why: 'drawn late',
      at: new Date('2026-09-20T06:33:00Z'),
      settled_at: new Date('2026-09-20T07:00:00Z'),
      task_id: TASK,
      task_at: new Date('2026-09-20T06:33:00Z'),
      ready_url: KEPT,
      ready_at: new Date('2026-09-20T06:40:00Z'),
      task_mode: 'gift',
    })
    await debts.noteOwed(owed as never, {
      owner: OWNER,
      lead: LEAD,
      what: 'picture',
      why: 'Kie: 402 insufficient balance',
    })
    expect(openRow(owed)).toMatchObject({
      settled_at: null,
      task_id: null,
      task_at: null,
      ready_url: null,
      ready_at: null,
      task_mode: null,
    })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'a different look' },
      s.ctx
    )
    expect(r.recovered, 'the old portrait was handed over again').toBeFalsy()
    expect(r.preview).toBe('https://s3.example/drawn-1.png')
    expect(s.draw.ledger.tasks).toBe(1)
    expect(s.check, 'asked about the old task').not.toHaveBeenCalled()
  })
})

// ─── a task that never answers is given up on ──────────────────────────────

describe('a stored task that never reaches a verdict is given up on', () => {
  const seed = async (owed: OwedDouble, taskAt: string) => {
    const debts = await import('./src/agent/crm-owed')
    await debts.ensureOwedTable(owed as never)
    owed.rows.push({
      owner_id: OWNER,
      lead_id: LEAD,
      what: 'picture',
      why: 'still drawing',
      at: new Date(taskAt),
      settled_at: null,
      task_id: TASK,
      task_at: new Date(taskAt),
      ready_url: null,
      ready_at: null,
      task_mode: 'gift',
    })
  }

  it('three weeks old and "record not found": a new portrait is drawn', async () => {
    vi.useFakeTimers()
    const owed = owedDouble()
    const s = await deliverySetup({ owed, plan: ['done'], kie: ['unknown'] })
    await seed(owed, '2026-09-01T10:00:00Z')
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x' },
      s.ctx
    )
    expect(s.check).toHaveBeenCalledWith(TASK)
    expect(r.pending, 'the lead stays in "drawing" forever').toBeFalsy()
    expect(r.preview).toBe('https://s3.example/drawn-1.png')
    expect(s.draw.ledger.tasks).toBe(1)
  })

  it('stuck "running" past the ceiling is given up on too', async () => {
    vi.useFakeTimers()
    const owed = owedDouble()
    const s = await deliverySetup({ owed, plan: ['done'], kie: ['running'] })
    // Two hours before the double's clock (12:00).
    await seed(owed, '2026-09-21T10:00:00Z')
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x' },
      s.ctx
    )
    expect(r.preview).toBe('https://s3.example/drawn-1.png')
  })

  it('a young task with no answer yet is still waited for', async () => {
    vi.useFakeTimers()
    const owed = owedDouble()
    const s = await deliverySetup({ owed, kie: ['unknown'] })
    await seed(owed, '2026-09-21T11:50:00Z')
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x' },
      s.ctx
    )
    expect(r.pending).toBe(true)
    expect(s.draw.ledger).toEqual({ tasks: 0, charges: 0 })
  })

  it('the watch keeps asking through a failed question, and "unknown" is not "running"', async () => {
    const late = await import('./src/agent/late-picture')
    const answers = ['unknown', 'success']
    const out = await late.watchLate(TASK, {
      check: async id =>
        answers.shift() === 'unknown'
          ? { state: 'unknown', taskId: id, reason: 'HTTP 502' }
          : { state: 'success', taskId: id, url: PROVIDER },
      keep: async () => KEPT,
      sleep: async () => undefined,
    })
    expect(out).toEqual({ state: 'ready', taskId: TASK, url: KEPT })
    const once = await late.lookOnce(TASK2, {
      check: async id => ({ state: 'unknown', taskId: id, reason: 'no key' }),
      keep: async () => KEPT,
    })
    expect(once.state).toBe('unknown')
  })
})

// ─── a paid portrait that came late is still paid ──────────────────────────

describe('a PAID portrait slower than the turn is still paid for, by the recipient', () => {
  it('pending -> ready -> handed over with the recipient charged 12, not as a gift', async () => {
    vi.useFakeTimers()
    const owed = owedDouble()
    const s = await deliverySetup({
      owed,
      plan: ['pending'],
      kie: ['running', 'success'],
      ownClient: true,
      balance: 500,
    })
    const first: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x', gift: false },
      s.ctx
    )
    expect(first.pending).toBe(true)
    expect(first.price).toBe(12)
    expect(s.draw.ledger, 'nobody pays at the owner turn').toEqual({
      tasks: 1,
      charges: 0,
    })
    expect(openRow(owed)?.task_mode).toBe('paid')
    await vi.advanceTimersByTimeAsync(30_000)
    await flush()
    expect(openRow(owed)?.ready_url).toBe(KEPT)
    // Asked again -- even by a call that says "gift": the terms it was
    // ordered on decide, and nobody has paid for it yet.
    const second: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x' },
      s.ctx
    )
    expect(second.recovered).toBe(true)
    expect(second.preview).toBe(KEPT)
    expect(second.price).toBe(12)
    expect(second.gift).toBe(false)
    expect(s.q.pendingFor(OWNER)!.charge).toEqual({
      telegramId: LEAD,
      op: 'gpt_image_edit',
      tokens: 12,
    })
    expect(String(s.q.pendingFor(OWNER)!.what ?? '')).not.toContain('подарок') // cyrillic-ok: the caption under test
    expect(s.draw.ledger).toEqual({ tasks: 1, charges: 0 })
  })

  it('a recipient who cannot pay is asked to top up; the portrait waits on the debt', async () => {
    const owed = owedDouble()
    const s = await deliverySetup({ owed, ownClient: true, balance: 3 })
    const debts = await import('./src/agent/crm-owed')
    await debts.ensureOwedTable(owed as never)
    owed.rows.push({
      owner_id: OWNER,
      lead_id: LEAD,
      what: 'picture',
      why: 'drawn late',
      at: new Date('2026-09-21T06:33:00Z'),
      settled_at: null,
      task_id: TASK,
      task_at: new Date('2026-09-21T06:33:00Z'),
      ready_url: KEPT,
      ready_at: new Date('2026-09-21T06:40:00Z'),
      task_mode: 'paid',
    })
    const r: any = await s.deliver.handler(
      { chat: '@test_lead', prompt: 'x', gift: false },
      s.ctx
    )
    expect(r.delivered).toBe(false)
    expect(r.price).toBe(12)
    expect(s.q.pendingCount()).toBe(0)
    expect(openRow(owed)).toMatchObject({ ready_url: KEPT, settled_at: null })
    expect(s.draw.ledger).toEqual({ tasks: 0, charges: 0 })
  })
})

// ─── the debt ───────────────────────────────────────────────────────────────

describe('crm_owed: a late answer for an OLD task does not overwrite a newer one', () => {
  it('the newer task keeps the debt; the old picture does not become the gift', async () => {
    const owed = owedDouble()
    const debts = await import('./src/agent/crm-owed')
    debts.forgetOwedTableForTests()
    await debts.attachTask(owed as never, {
      owner: OWNER,
      lead: LEAD,
      taskId: TASK,
      why: 'first try, slow',
    })
    await debts.attachTask(owed as never, {
      owner: OWNER,
      lead: LEAD,
      taskId: TASK2,
      why: 'second try',
    })
    const stale = await debts.markReady(owed as never, {
      owner: OWNER,
      lead: LEAD,
      url: KEPT,
      taskId: TASK,
    })
    expect(stale).toBe(false)
    expect(openRow(owed)).toMatchObject({ task_id: TASK2, ready_url: null })
    const fresh = await debts.markReady(owed as never, {
      owner: OWNER,
      lead: LEAD,
      url: KEPT,
      taskId: TASK2,
    })
    expect(fresh).toBe(true)
    expect(openRow(owed)).toMatchObject({ task_id: TASK2, ready_url: KEPT })
  })
})

// ─── the queue ──────────────────────────────────────────────────────────────

describe('the queue: a portrait drawing is left alone, a finished one goes out', () => {
  const now = new Date('2026-09-21T12:00:00Z')
  const queuePool = {
    query: async (sql: string) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      if (/FROM crm_messages WHERE owner_id = \$1 GROUP BY lead_id/.test(flat))
        return {
          rows: [
            {
              lead_id: LEAD,
              total: 4,
              inbound: 2,
              last_in: '2026-09-21T06:30:00Z',
              last_out: '2026-09-21T06:35:00Z',
            },
          ],
        }
      return { rows: [] }
    },
  }
  const debt = (over: Record<string, unknown>) =>
    new Map([
      [
        LEAD,
        {
          what: 'picture',
          why: 'still drawing',
          at: new Date('2026-09-21T06:33:00Z'),
          ...over,
        },
      ],
    ])

  it('a finished portrait is a delivery, even while the provider looks down', async () => {
    const { leadCandidates } = await import('./src/agent/chat-memory')
    const [c] = await leadCandidates(queuePool as never, OWNER, {
      now,
      owed: debt({ readyUrl: KEPT, taskId: TASK }) as never,
      imagesDown: { why: 'timeout', minutesAgo: 3 },
    })
    expect(c.next).toBe('deliver')
    expect(c.because).toContain('crm_deliver_photo')
  })

  it('a portrait inside its watch is not chased', async () => {
    const { leadCandidates } = await import('./src/agent/chat-memory')
    const [c] = await leadCandidates(queuePool as never, OWNER, {
      now,
      owed: debt({
        taskId: TASK,
        taskAt: new Date(now.getTime() - 5 * 60_000),
      }) as never,
    })
    expect(c.next).toBe('wait')
  })

  it('past its watch, the stored task is asked about by a delivery', async () => {
    const { leadCandidates } = await import('./src/agent/chat-memory')
    const [c] = await leadCandidates(queuePool as never, OWNER, {
      now,
      owed: debt({
        taskId: TASK,
        taskAt: new Date(now.getTime() - 60 * 60_000),
      }) as never,
    })
    expect(c.next).toBe('deliver')
  })
})

// ─── the wait ───────────────────────────────────────────────────────────────

describe("the turn's wait fits the sweep's step budget", () => {
  it('PORTRAIT_WAIT_MS leaves room inside SWEEP_STEP_BUDGET_MS', async () => {
    // Read from the bot's own file: the two services do not share a module,
    // and a copied number is the one that drifts.
    const bot = fs.readFileSync(
      path.join(
        __dirname,
        '../../../src/inngest_app/functions/crm/crmProactiveSweep.ts'
      ),
      'utf8'
    )
    const m = /export const SWEEP_STEP_BUDGET_MS = ([\d_]+)/.exec(bot)
    expect(m, 'the budget constant was not found').not.toBeNull()
    const budget = Number(m![1].replace(/_/g, ''))
    const { PORTRAIT_WAIT_MS } = await import('./src/agent/crm-deliver-tool')
    expect(budget).toBeGreaterThan(0)
    // The model's own steps need time too: the wait takes at most 3/4.
    expect(PORTRAIT_WAIT_MS).toBeLessThanOrEqual(budget * 0.75)
    expect(PORTRAIT_WAIT_MS).toBeGreaterThanOrEqual(30_000)
  })
})
