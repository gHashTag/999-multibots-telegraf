/**
 * payment-ai-server-process credits an invoice at most once, and only the
 * amount that was invoiced.
 *
 * Spec: t27 specs/functions/payment-ai-server-process.t27 (NOTE 2026-09-17).
 *
 * Two layers:
 *   1. claimPendingInvoice -- the compare-and-set against payments_v2:
 *      unknown row, amount mismatch, already COMPLETED, lost race, claimed.
 *   2. the Inngest handler -- what each claim outcome does to the money:
 *      refused payloads throw NonRetriableError (no credit, admin via
 *      onFailure), an already-claimed row returns without crediting or
 *      notifying, a claimed row credits once and notifies once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NonRetriableError } from 'inngest'

// ---------- supabase mock: a tiny query builder ----------
const db = {
  row: null as null | { inv_id: string; status: string; amount: number },
  readError: null as null | { message: string },
  updateError: null as null | { message: string },
  raceLost: false,
  updates: [] as Array<Record<string, unknown>>,
}

function builder() {
  const st: { op: 'select' | 'update'; patch?: Record<string, unknown> } = {
    op: 'select',
  }
  const b: any = {
    select: (_cols?: string) => b,
    update: (patch: Record<string, unknown>) => {
      st.op = 'update'
      st.patch = patch
      return b
    },
    eq: () => b,
    maybeSingle: async () => ({ data: db.row, error: db.readError }),
    then: (resolve: (v: unknown) => void) => {
      // awaited update(...).eq().eq().select()
      if (db.updateError) return resolve({ data: null, error: db.updateError })
      if (db.raceLost || !db.row || db.row.status !== 'PENDING') {
        return resolve({ data: [], error: null })
      }
      db.updates.push(st.patch!)
      db.row = { ...db.row, status: 'COMPLETED' }
      return resolve({ data: [{ inv_id: db.row.inv_id }], error: null })
    },
  }
  return b
}

vi.mock('@/core/supabase/client', () => ({
  supabaseAdmin: { from: () => builder() },
  supabase: { from: () => builder() },
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/config', () => ({
  ADMIN_IDS_ARRAY: [],
  isDev: false,
  SUPABASE_URL: 'x',
  SUPABASE_SERVICE_KEY: 'x',
  SUPABASE_SERVICE_ROLE_KEY: 'x',
}))

// ---------- handler collaborators ----------
const money = {
  updateUserBalance: vi.fn(async () => true),
  getTelegramIdFromInvId: vi.fn(async () => ({
    telegram_id: '144022504',
    username: 'u',
    language_code: 'ru',
    bot_name: 'neuro_blogger_bot',
  })),
}
vi.mock('@/core/supabase', () => ({
  updateUserBalance: (...a: unknown[]) => money.updateUserBalance(...a),
  getTelegramIdFromInvId: (...a: unknown[]) =>
    money.getTelegramIdFromInvId(...a),
}))
vi.mock('@/core/bot', () => ({
  createBotByName: async () => ({ groupId: '-1' }),
  defaultBot: {},
}))
const tg = { sendMessage: vi.fn(async () => ({})) }
vi.mock('telegraf', () => ({
  Telegraf: class {
    telegram = tg
  },
}))
vi.mock('@/helpers/error/errorMessageAdmin', () => ({
  errorMessageAdmin: vi.fn(),
}))
vi.mock('@/helpers', () => ({ errorMessage: vi.fn() }))

import {
  claimPendingInvoice,
  amountsMatch,
} from '@/core/supabase/claimPendingInvoice'
import { getHandler } from '@/inngest_app/test/utils/test-helpers'
import { processPayment } from '@/inngest_app/functions/payments/paymentProcessing'

const handler = getHandler(processPayment)
const step = { run: async (_n: string, fn: () => Promise<unknown>) => fn() }
const ev = (IncSum: string, inv_id = 'inv-1') => ({
  name: 'payment/ai-server.process',
  data: { IncSum, inv_id },
})

beforeEach(() => {
  db.row = { inv_id: 'inv-1', status: 'PENDING', amount: 1000 }
  db.readError = null
  db.updateError = null
  db.raceLost = false
  db.updates = []
  money.updateUserBalance.mockClear()
  tg.sendMessage.mockClear()
  process.env.BOT_TOKEN_1 = 'token-1'
})

describe('claimPendingInvoice', () => {
  it('amountsMatch compares whole roubles', () => {
    expect(amountsMatch(1000, 1000)).toBe(true)
    expect(amountsMatch('1000.00', 1000)).toBe(true)
    expect(amountsMatch(999.6, 1000)).toBe(true)
    expect(amountsMatch(500, 1000)).toBe(false)
    expect(amountsMatch(null, 1000)).toBe(false)
  })

  it('unknown row -> unknown-invoice, nothing updated', async () => {
    db.row = null
    expect(await claimPendingInvoice('nope', 1000)).toEqual({
      ok: false,
      outcome: 'unknown-invoice',
    })
    expect(db.updates).toEqual([])
  })

  it('paid amount differs from the invoiced one -> amount-mismatch, nothing updated', async () => {
    const r = await claimPendingInvoice('inv-1', 100)
    expect(r).toEqual({
      ok: false,
      outcome: 'amount-mismatch',
      invoiced: 1000,
      paid: 100,
    })
    expect(db.updates).toEqual([])
  })

  it('already COMPLETED -> already-claimed, nothing updated', async () => {
    db.row!.status = 'COMPLETED'
    expect(await claimPendingInvoice('inv-1', 1000)).toEqual({
      ok: false,
      outcome: 'already-claimed',
      status: 'COMPLETED',
    })
    expect(db.updates).toEqual([])
  })

  it('lost the compare-and-set race -> already-claimed', async () => {
    db.raceLost = true
    expect(await claimPendingInvoice('inv-1', 1000)).toMatchObject({
      ok: false,
      outcome: 'already-claimed',
    })
  })

  it('PENDING with the right amount -> claimed, status flipped once', async () => {
    expect(await claimPendingInvoice('inv-1', 1000)).toEqual({
      ok: true,
      outcome: 'claimed',
      invoiced: 1000,
    })
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0]).toMatchObject({ status: 'COMPLETED' })
    expect(db.row!.status).toBe('COMPLETED')
    // The second claim of the same invoice is refused.
    expect(await claimPendingInvoice('inv-1', 1000)).toMatchObject({
      ok: false,
      outcome: 'already-claimed',
    })
  })

  it('a read error is db-error (retriable), not a refusal', async () => {
    db.readError = { message: 'boom' }
    expect(await claimPendingInvoice('inv-1', 1000)).toEqual({
      ok: false,
      outcome: 'db-error',
      error: 'boom',
    })
  })
})

describe('payment-ai-server-process handler and the claim', () => {
  it('claimed: credits once and notifies once', async () => {
    const out = (await handler({ event: ev('1000'), step } as never)) as any
    expect(out).toMatchObject({ success: true, amount: 1000 })
    expect(money.updateUserBalance).toHaveBeenCalledTimes(1)
    expect(tg.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('already COMPLETED: returns already_claimed, no credit, no notification', async () => {
    db.row!.status = 'COMPLETED'
    const out = (await handler({ event: ev('1000'), step } as never)) as any
    expect(out).toEqual({
      success: true,
      already_claimed: true,
      inv_id: 'inv-1',
    })
    expect(money.updateUserBalance).not.toHaveBeenCalled()
    expect(tg.sendMessage).not.toHaveBeenCalled()
  })

  it('amount mismatch: NonRetriableError, no credit', async () => {
    db.row!.amount = 500
    await expect(
      handler({ event: ev('1000'), step } as never)
    ).rejects.toBeInstanceOf(NonRetriableError)
    expect(money.updateUserBalance).not.toHaveBeenCalled()
    expect(db.updates).toEqual([])
  })

  it('unknown invoice: NonRetriableError, no credit', async () => {
    db.row = null
    money.getTelegramIdFromInvId.mockResolvedValueOnce({
      telegram_id: '1',
      bot_name: 'neuro_blogger_bot',
    } as any)
    await expect(
      handler({ event: ev('1000', 'nope'), step } as never)
    ).rejects.toBeInstanceOf(NonRetriableError)
    expect(money.updateUserBalance).not.toHaveBeenCalled()
  })

  it('db error on the claim is retriable (plain Error), no credit', async () => {
    db.readError = { message: 'boom' }
    const p = handler({ event: ev('1000'), step } as never)
    await expect(p).rejects.toThrow('claim-invoice db error')
    await expect(p).rejects.not.toBeInstanceOf(NonRetriableError)
    expect(money.updateUserBalance).not.toHaveBeenCalled()
  })

  it('the manifest lists claim-invoice before update-user-balance', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const m = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', 'inngest_app', 'functions.manifest.json'),
        'utf8'
      )
    )
    const f = m.functions.find((x: any) => x.id === 'payment-ai-server-process')
    const i = f.steps.indexOf('claim-invoice')
    expect(i).toBeGreaterThan(-1)
    expect(f.steps.indexOf('update-user-balance')).toBe(i + 1)
  })
})
