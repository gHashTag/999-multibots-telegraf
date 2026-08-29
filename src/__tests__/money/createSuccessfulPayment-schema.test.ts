/**
 * Regression test: createSuccessfulPayment must be able to succeed at all.
 *
 * It built its insert with String(telegram_id) and a LOWERCASED type, then
 * validated that object against CreatePaymentV2Schema, which requires
 * telegram_id: z.number() and type: OperationTypeEnum (uppercase only). So
 * parse() threw on every call and the function always rejected — its one live
 * caller, `/admin_sub override <id> <TYPE>` (the documented remedy for manually
 * activating a paid user's subscription), could never create a row.
 */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const insertMock = vi.fn()
// The SUT first looks up an existing payment by inv_id (select/eq/maybeSingle),
// then inserts (insert/select/single). One chainable stub covers both.
vi.mock('@/core/supabase', () => {
  const makeChain = (inserted?: unknown) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = self
    chain.eq = self
    chain.maybeSingle = async () => ({ data: null, error: null }) // no duplicate
    chain.single = async () => ({
      data: inserted ? { id: 1, ...(inserted as object) } : null,
      error: null,
    })
    chain.insert = (row: unknown) => {
      insertMock(row)
      return makeChain(row)
    }
    return chain
  }
  return {
    supabase: { from: () => makeChain() },
    getUserByTelegramIdString: vi.fn(async () => ({
      id: 1,
      telegram_id: '321330903',
    })),
  }
})

vi.mock('@/config', () => ({ ADMIN_IDS_ARRAY: [] }))

import { createSuccessfulPayment } from '@/core/supabase/createSuccessfulPayment'
import { PaymentStatus, Currency } from '@/interfaces/payments.interface'

const adminOverrideArgs = {
  // Exactly what adminSubscriptionCommand.ts:210 passes.
  telegram_id: '321330903',
  amount: 0,
  type: 'subscription_override',
  description: 'Manual subscription override: NEUROVIDEO',
  bot_name: 'admin_tools',
  service_type: 'subscription',
  model_name: 'manual_override',
  payment_method: 'ADMIN_OVERRIDE',
  metadata: { manual_override: true },
  inv_id: 'admin_override_321330903_1',
  stars: 0,
  status: PaymentStatus.COMPLETED,
  currency: Currency.STARS,
} as any

async function insertedRowFor(overrides: Record<string, unknown> = {}) {
  insertMock.mockReset()
  // Must not throw: before the fix, CreatePaymentV2Schema.parse() rejected the
  // function's own insert object on every call.
  await createSuccessfulPayment({ ...adminOverrideArgs, ...overrides } as any)
  expect(
    insertMock,
    'insert never ran -- the function rejected its own data again'
  ).toHaveBeenCalledTimes(1)
  return insertMock.mock.calls[0][0] as Record<string, unknown>
}

describe('createSuccessfulPayment schema contract', () => {
  it('the admin override call reaches the insert instead of throwing', async () => {
    const row = await insertedRowFor()
    expect(row).toBeTruthy()
  })

  it('inserts telegram_id as a NUMBER (schema requires z.number())', async () => {
    const row = await insertedRowFor()
    expect(typeof row.telegram_id).toBe('number')
    expect(row.telegram_id).toBe(321330903)
  })

  it('inserts an UPPERCASE operation type from the enum', async () => {
    const row = await insertedRowFor()
    const allowed = [
      'MONEY_INCOME',
      'MONEY_OUTCOME',
      'BONUS',
      'REFUND',
      'SUBSCRIPTION_PURCHASE',
      'SUBSCRIPTION_RENEWAL',
      'REFERRAL',
      'SYSTEM',
    ]
    expect(allowed).toContain(row.type)
    // 'subscription_override' is not an enum member, so it maps to the value
    // every real production subscription row uses.
    expect(row.type).toBe('MONEY_INCOME')
  })

  it('passes a caller-supplied valid type through, uppercased', async () => {
    const row = await insertedRowFor({ type: 'money_outcome', inv_id: 'x2' })
    expect(row.type).toBe('MONEY_OUTCOME')
  })

  it('keeps the subscription-granting fields the reader matches on', async () => {
    const row = await insertedRowFor()
    // getUserDetailsSubscription matches on status + subscription_type.
    expect(row.status).toBe('COMPLETED')
    expect(row).toHaveProperty('subscription_type')
  })
})
