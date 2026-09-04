import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The billing job runs unattended and tells bot owners they owe the platform
 * money. The figure is platform_share minus what the owner has paid, and the
 * payments come from a separate table.
 *
 * When that query failed, the sum stayed at its initial 0 -- which does not mean
 * "the owner paid nothing", it means we do not know what they paid. The debt was
 * then the FULL platform share, and above 500 that message repeats every three
 * days. An owner who had paid in full would be dunned by a bot, on the strength
 * of a network error, with nobody watching.
 *
 * These tests pin the difference between zero and unknown at the place it is
 * decided.
 */
const from = vi.fn()

vi.mock('@/core/supabase', () => ({
  supabaseAdmin: { from: (...a: unknown[]) => from(...a) },
}))
vi.mock('@/utils/logger', () => {
  const l = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger: l, default: l }
})

/**
 * payments_v2 is paged and filtered by type. The mock has to honour the type,
 * or the single fixture row is handed to whichever query runs first -- which is
 * costs, leaving income at zero and every debt at zero. That is how the first
 * version of this test quietly asserted nothing.
 */
const pageFor = (type: string, served: Set<string>) => ({
  select: () => ({
    eq: () => ({
      eq: (_col: string, value: string) => ({
        range: () => {
          if (value !== type || served.has(value)) {
            return Promise.resolve({ data: [], error: null })
          }
          served.add(value)
          return Promise.resolve({
            data: [
              {
                status: 'COMPLETED',
                stars: 4000,
                amount: 4000,
                currency: 'XTR',
                cost: 0,
                type,
                payment_method: 'Telegram',
                service_type: 'x',
              },
            ],
            error: null,
          })
        },
      }),
    }),
  }),
})

const paymentsTable = (result: {
  data?: unknown[]
  error?: { message: string }
}) => ({
  select: () => ({ eq: () => Promise.resolve(result) }),
})

let ownerPaymentsResult: { data?: unknown[]; error?: { message: string } }
let served: Set<string>

beforeEach(() => {
  served = new Set()
  from.mockImplementation((table: string) => {
    if (table === 'owner_payments') return paymentsTable(ownerPaymentsResult)
    return pageFor('MONEY_INCOME', served)
  })
})

describe('owner debt: unknown payments are not zero payments', () => {
  /**
   * The half that reaches a person lives in the scheduled loop, which cannot be
   * driven from here without standing up the whole job. Asserted against the
   * source instead: the loop must SKIP on unknown payments rather than compare
   * an upper bound against the thresholds. A behavioural test that cannot see
   * this half would be worse than an honest structural one.
   */
  it('the scheduled loop refuses to notify when payments are unknown', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'services', 'bot-owner-billing.ts'),
      'utf8'
    )
    expect(src).toMatch(/if \(!payments_known\)/)
    // and it must bail out before the threshold ladder, not merely log
    const at = src.indexOf('if (!payments_known)')
    const ladder = src.indexOf('if (debt > 500)')
    expect(at).toBeGreaterThan(0)
    expect(at).toBeLessThan(ladder)
    expect(src.slice(at, ladder)).toContain('continue')
  })

  it('reports payments_known when the table answers', async () => {
    ownerPaymentsResult = { data: [{ amount_stars: 100 }], error: undefined }
    const { calculateOwnerDebt } = await import('@/services/bot-owner-billing')
    const s = await calculateOwnerDebt('bot')
    expect(s.payments_known).toBe(true)
    expect(s.total_owner_payments).toBe(100)
  })

  it('does NOT report payments_known when the query errors', async () => {
    ownerPaymentsResult = { data: undefined, error: { message: 'boom' } }
    vi.resetModules()
    const { calculateOwnerDebt } = await import('@/services/bot-owner-billing')
    const s = await calculateOwnerDebt('bot')
    // The sum is still 0, and that is exactly why the flag has to exist: a
    // reader cannot tell this 0 from a genuine "paid nothing".
    expect(s.total_owner_payments).toBe(0)
    expect(s.payments_known).toBe(false)
  })

  it('the debt computed without that figure is an upper bound, not a fact', async () => {
    ownerPaymentsResult = { data: [{ amount_stars: 2000 }], error: undefined }
    served.clear() // the paging guard is per-call, and this test calls twice
    vi.resetModules()
    const paid = await (
      await import('@/services/bot-owner-billing')
    ).calculateOwnerDebt('bot')

    ownerPaymentsResult = { data: undefined, error: { message: 'boom' } }
    served.clear()
    vi.resetModules()
    const unknown = await (
      await import('@/services/bot-owner-billing')
    ).calculateOwnerDebt('bot')

    // Sanity: the fixture must actually produce a debt, or this test would
    // compare two zeros and pass for the wrong reason.
    expect(unknown.debt).toBeGreaterThan(0)

    // Same underlying data; the only difference is whether the payments query
    // answered. The failure makes the owner look like they owe strictly more.
    expect(unknown.debt).toBeGreaterThan(paid.debt)
    expect(unknown.payments_known).toBe(false)
    expect(paid.payments_known).toBe(true)
  })
})
