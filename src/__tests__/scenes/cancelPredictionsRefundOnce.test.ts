import { describe, it, expect, beforeEach, vi } from 'vitest'

// Refund-mint hardening. cancelPredictionsWizard refunded ctx.session.paymentAmount
// INSIDE the cancel loop -- once per prediction whose prompt matched the user's.
// A single payment (ctx.session.paymentAmount) thus paid out N times when N
// predictions matched (the user's own re-submits, or another user's identical
// prompt). The refund must fire ONCE for the cancelled operation, not per match.
// The scene is registered but currently unreachable -- this guards the mint for
// the day it is wired.

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  refundUser: vi.fn(),
}))

vi.mock('axios', () => ({ default: { get: h.get, post: h.post } }))
vi.mock('@/price/helpers', () => ({ refundUser: h.refundUser }))
vi.mock('@/helpers/language', () => ({ isRussian: () => false }))
vi.mock('@/navigation', () => ({ sendGenericErrorMessage: vi.fn() }))

import { cancelPredictionsWizard } from '@/scenes/cancelPredictionsWizard'
import type { MyContext } from '@/interfaces'

const firstStep = (
  cancelPredictionsWizard as unknown as {
    steps: Array<
      (ctx: MyContext, next: () => Promise<void>) => Promise<unknown>
    >
  }
).steps[0]

function makeCtx() {
  return {
    from: { id: 555 },
    session: { prompt: 'a cat', paymentAmount: 10 },
    reply: vi.fn().mockResolvedValue(undefined),
    scene: { leave: vi.fn() },
  } as unknown as MyContext
}

// Two in-progress predictions share the user's prompt -> both get cancelled.
const twoMatching = {
  data: {
    results: [
      {
        id: 'p1',
        status: 'processing',
        input: { prompt: 'a cat' },
        urls: { cancel: 'https://c/p1' },
      },
      {
        id: 'p2',
        status: 'processing',
        input: { prompt: 'a cat' },
        urls: { cancel: 'https://c/p2' },
      },
    ],
  },
}

describe('cancelPredictionsWizard refunds ONCE per cancellation, not per prediction (no mint)', () => {
  beforeEach(() => {
    h.get.mockReset().mockResolvedValue(twoMatching)
    h.post.mockReset().mockResolvedValue({ data: {} })
    h.refundUser.mockReset().mockResolvedValue(undefined)
  })

  it('two matching predictions -> both cancelled, but refundUser called ONCE', async () => {
    await firstStep(makeCtx(), () => Promise.resolve())
    expect(h.post).toHaveBeenCalledTimes(2) // both predictions cancelled
    expect(h.refundUser).toHaveBeenCalledTimes(1) // but refunded once, not twice
  })

  it('no matching predictions -> no refund', async () => {
    h.get.mockResolvedValue({
      data: {
        results: [
          {
            id: 'p9',
            status: 'processing',
            input: { prompt: 'other' },
            urls: { cancel: 'https://c/p9' },
          },
        ],
      },
    })
    await firstStep(makeCtx(), () => Promise.resolve())
    expect(h.post).not.toHaveBeenCalled()
    expect(h.refundUser).not.toHaveBeenCalled()
  })
})
