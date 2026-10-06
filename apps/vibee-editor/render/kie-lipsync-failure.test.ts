/**
 * A FAILED KIE LIPSYNC: WHY IT FAILED, ONE RETRY WHEN IT WAS KIE'S HICCUP,
 * AND THE MONEY BACK -- ONCE.
 *
 * Production 2026-10-05: three lipsync tasks failed at Kie in a row and the
 * route logged only "Generation failed. Please try again later." -- no task,
 * no code. All three were the house wallet (nothing charged, nothing owed),
 * but the same path serves paying people.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  runKieJob,
  KieTaskFailed,
  isTransientKieFailure,
  состояниеЗадания as getTaskState, // cyrillic-ok: the module's export name
} from './src/agent/kie-run'
import {
  failureAfterCharge,
  GENERATION_REFUSAL_CODES,
} from './generation-refusal'
import { spendByTid, refundByTid } from './src/agent/billing-shared'
import { forgetTokenLedgerTables } from './src/token-ledger'
import { lipsyncRefundWords } from './src/agent/tools'

const REFUSAL = 'отказ' // cyrillic-ok: the module's field name

/** A Kie stand-in: each started task follows the next script in the list. */
function fakeKie(scripts: Array<Array<Record<string, unknown>>>) {
  let n = 0
  const polls: Record<string, number> = {}
  const start = vi.fn(async () => {
    const id = `task-${n++}`
    polls[id] = 0
    return { taskId: id }
  })
  const state = vi.fn(async (taskId: string) => {
    const script = scripts[Number(taskId.split('-')[1])] ?? [{}]
    const i = Math.min(polls[taskId]++, script.length - 1)
    return { готово: false, ...script[i] } as never // cyrillic-ok: the module's field name
  })
  const lines: string[] = []
  return {
    start,
    state,
    lines,
    deps: {
      start: start as never,
      state: state as never,
      sleep: async () => undefined,
      log: (l: string) => lines.push(l),
    },
  }
}

const SAID_TRY_LATER = {
  [REFUSAL]: 'Generation failed. Please try again later.',
  failCode: '500',
}
const SAID_CONTENT = {
  [REFUSAL]: 'Content policy violation: the image was flagged',
  failCode: '400',
}

describe('which Kie failures earn a retry', () => {
  it.each([
    ['500', 'Generation failed. Please try again later.'],
    [undefined, 'internal error, please try again later'],
    ['455', 'Service Unavailable'],
    ['429', 'Rate limited'],
    ['408', 'Upstream timed out'],
  ])('transient: %s %s', (code, msg) => {
    expect(isTransientKieFailure(code, msg)).toBe(true)
  })

  it.each([
    ['400', 'Content policy violation'],
    ['422', 'image_url is required'],
    ['500', 'No face detected in the image'],
    ['402', 'Insufficient credits'],
    ['GENERATION_FAILED', 'The generation task failed.'],
    [undefined, 'something new and unexplained'],
    [undefined, 'more information needed'],
  ])('permanent: %s %s', (code, msg) => {
    expect(isTransientKieFailure(code, msg)).toBe(false)
  })
})

describe('runKieJob', () => {
  it("names Kie's failCode and failMsg in the error, not a generic line", async () => {
    const k = fakeKie([[{}, SAID_CONTENT]])
    const err = await runKieJob(
      'kling/ai-avatar-standard',
      {},
      { attempts: 10, retryTransientOnce: true },
      k.deps
    ).catch(e => e)
    expect(err).toBeInstanceOf(KieTaskFailed)
    expect(err.message).toContain('task-0')
    expect(err.message).toContain('failCode 400')
    expect(err.message).toContain('Content policy violation')
    expect(err.transient).toBe(false)
    expect(k.lines.join('\n')).toMatch(/failCode=400.*not retried/)
  })

  it('a content failure is not retried', async () => {
    const k = fakeKie([[SAID_CONTENT], [{ url: 'https://x/ok.mp4' }]])
    await expect(
      runKieJob(
        'kling/ai-avatar-standard',
        {},
        { attempts: 10, retryTransientOnce: true },
        k.deps
      )
    ).rejects.toBeInstanceOf(KieTaskFailed)
    expect(k.start).toHaveBeenCalledTimes(1)
  })

  it('a transient failure is retried ONCE, with the same model and input', async () => {
    const k = fakeKie([[SAID_TRY_LATER], [{}, { url: 'https://x/ok.mp4' }]])
    const input = { image_url: 'i', audio_url: 'a' }
    const r = await runKieJob(
      'kling/ai-avatar-standard',
      input,
      { attempts: 10, retryTransientOnce: true },
      k.deps
    )
    expect(r).toEqual({ url: 'https://x/ok.mp4', taskId: 'task-1' })
    expect(k.start).toHaveBeenCalledTimes(2)
    expect(k.start.mock.calls[1]).toEqual(['kling/ai-avatar-standard', input])
  })

  it('never a second retry', async () => {
    const k = fakeKie([[SAID_TRY_LATER], [SAID_TRY_LATER], [{ url: 'u' }]])
    const err = await runKieJob(
      'm',
      {},
      { attempts: 10, retryTransientOnce: true },
      k.deps
    ).catch(e => e)
    expect(err).toBeInstanceOf(KieTaskFailed)
    expect(err.taskId).toBe('task-1')
    expect(k.start).toHaveBeenCalledTimes(2)
  })

  it('no retry unless the caller asks for it (video, audio)', async () => {
    const k = fakeKie([[SAID_TRY_LATER], [{ url: 'u' }]])
    await expect(
      runKieJob('m', {}, { attempts: 10 }, k.deps)
    ).rejects.toBeInstanceOf(KieTaskFailed)
    expect(k.start).toHaveBeenCalledTimes(1)
  })

  it('the retry spends only the polls that are left, never a new budget', async () => {
    // Fails on the 6th of 10 polls: 4 left < half, so no retry -- the caller's
    // wait (attempts * interval) is never outlived.
    const k = fakeKie([[{}, {}, {}, {}, {}, SAID_TRY_LATER], [{ url: 'u' }]])
    await expect(
      runKieJob('m', {}, { attempts: 10, retryTransientOnce: true }, k.deps)
    ).rejects.toBeInstanceOf(KieTaskFailed)
    expect(k.start).toHaveBeenCalledTimes(1)

    // A retry that never finishes stops at the shared budget: 10 polls total.
    const slow = fakeKie([[SAID_TRY_LATER], [{}]])
    await expect(
      runKieJob('m', {}, { attempts: 10, retryTransientOnce: true }, slow.deps)
    ).rejects.toThrow('ещё выполняет задачу task-1')
    expect(slow.state).toHaveBeenCalledTimes(10)
  })

  it('a refusal to start is thrown as before', async () => {
    const start = vi.fn(async () => ({ [REFUSAL]: 'prompt is required' }))
    await expect(
      runKieJob(
        'm',
        {},
        { retryTransientOnce: true },
        { start: start as never, sleep: async () => undefined }
      )
    ).rejects.toThrow('prompt is required')
    expect(start).toHaveBeenCalledTimes(1)
  })
})

describe('the status read keeps failCode', () => {
  it('passes Kie failCode through, as a string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            state: 'fail',
            failCode: 500,
            failMsg: 'Generation failed. Please try again later.',
          },
        }),
      })
    )
    const s = await getTaskState('t', 'key')
    vi.unstubAllGlobals()
    expect(s.failCode).toBe('500')
    expect(s[REFUSAL]).toBe('Generation failed. Please try again later.')
  })
})

describe('the person hears that the tokens came back', () => {
  it('a refunded failure has its own code; an unrefunded one does not claim it', () => {
    expect(GENERATION_REFUSAL_CODES).toContain('generation_failed_refunded')
    expect(failureAfterCharge('Kie task t failed', 150)).toEqual({
      success: false,
      error: 'Kie task t failed',
      code: 'generation_failed_refunded',
      refunded: 150,
    })
    // Nothing charged (agent, owner) or the refund failed: plain failure,
    // the stamp adds generation_failed.
    expect(failureAfterCharge('x', 0)).toEqual({ success: false, error: 'x' })
  })

  it('the lipsync route answers with the refund result, and retries Kie once', () => {
    const server = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    const at = server.indexOf("req.url === '/api/generate/lipsync'")
    const route = server.slice(at, server.indexOf('const avatarMatch', at))
    expect(route).toContain('retryTransientOnce: true')
    expect(route).toMatch(/const refundedOk = await refundMiniAppUser\(/)
    expect(route).toMatch(/billedSpendId\s*\)/)
    expect(route).toMatch(
      /failureAfterCharge\([\s\S]*refundedOk \? \(receipt\.charged \?\? 0\) : 0/
    )
    expect(route).toContain('error.failCode')
  })

  it('the agent says only what is true about the money', () => {
    expect(lipsyncRefundWords(0, false)).toBe('Ничего не списано.')
    expect(lipsyncRefundWords(150, true)).toBe('Токены возвращены (150).')
    expect(lipsyncRefundWords(150, false)).toMatch('не прошёл')
  })
})

/** The same tiny Postgres as a-refund-happens-once.test.ts, per-second. */
function fakeDb(startingBalance: number) {
  const ledger: Array<{
    id: number
    kind: string
    ref: string | null
    delta: number
  }> = []
  let balance = startingBalance
  let nextId = 1
  return {
    get balance() {
      return balance
    },
    ledger,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(CREATE|BEGIN|COMMIT|ROLLBACK)/i.test(s)) return { rows: [] }
      if (s.startsWith('SELECT balance FROM user_tokens'))
        return { rows: [{ balance }] }
      if (s.startsWith('SELECT 1 FROM token_ledger WHERE kind')) {
        // The pre-check moveTokens makes; the real guard is the unique index
        // below, but without a transaction this fake cannot roll back.
        const [kind, ref] = params as [string, string]
        const hit = ledger.some(r => r.kind === kind && r.ref === ref)
        return { rows: hit ? [{ '?column?': 1 }] : [] }
      }
      if (s.startsWith('SELECT 1 FROM token_ledger')) {
        return { rows: ledger.length ? [{ '?column?': 1 }] : [] }
      }
      if (s.startsWith('UPDATE user_tokens SET balance = balance - ')) {
        const [, amount] = params as [string, number]
        if (balance < amount) return { rows: [], rowCount: 0 }
        balance -= amount
        return { rows: [{ balance }], rowCount: 1 }
      }
      if (s.startsWith('UPDATE user_tokens SET balance = balance + ')) {
        const [, amount] = params as [string, number]
        balance += amount
        return { rows: [{ balance }], rowCount: 1 }
      }
      if (s.startsWith('INSERT INTO user_tokens'))
        return { rows: [{ balance }], rowCount: 1 }
      if (s.startsWith('INSERT INTO token_ledger')) {
        const [, delta, , kind, , ref] = params as [
          string,
          number,
          number,
          string,
          string,
          string | null,
        ]
        if (ref != null && ledger.some(r => r.kind === kind && r.ref === ref)) {
          const e: Error & { code?: string; constraint?: string } = new Error(
            'duplicate key value violates unique constraint "token_ledger_once"'
          )
          e.code = '23505'
          e.constraint = 'token_ledger_once'
          throw e
        }
        const id = nextId++
        ledger.push({ id, kind, ref: ref ?? null, delta })
        return { rows: [{ id }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    },
  }
}

describe('a failed per-second lipsync is refunded in user_tokens, once', () => {
  beforeEach(() => forgetTokenLedgerTables())

  it('the whole per-second charge comes back, and a retried refund adds zero', async () => {
    const db = fakeDb(10_000)
    const model = 'kie/kling/ai-avatar-standard'
    const spent = await spendByTid(
      db as never,
      '900000077',
      'lipsync_generate',
      9,
      model
    )
    expect(spent.ok).toBe(true)
    const charged = spent.списано as number // cyrillic-ok: shared API field
    expect(charged).toBeGreaterThan(0)
    expect(db.balance).toBe(10_000 - charged)

    const first = await refundByTid(
      db as never,
      '900000077',
      'lipsync_generate',
      9,
      model,
      charged,
      spent.ledgerId
    )
    expect(first).toEqual({ ok: true, refunded: charged })
    const again = await refundByTid(
      db as never,
      '900000077',
      'lipsync_generate',
      9,
      model,
      charged,
      spent.ledgerId
    )
    expect(again).toEqual({ ok: true, refunded: 0, already: true })

    expect(db.balance).toBe(10_000)
    expect(db.ledger.filter(r => r.kind === 'refund')).toHaveLength(1)
  })
})
