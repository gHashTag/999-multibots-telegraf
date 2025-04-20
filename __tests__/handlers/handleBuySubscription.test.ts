import { jest, describe, beforeEach, it, expect } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'

import { handleBuySubscription } from '../../src/handlers/handleBuySubscription'
import { levels } from '@/menu/mainMenu'

describe('handleBuySubscription', () => {
  let ctx
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.session = { subscription: 'neurophoto' }
    ctx.replyWithInvoice = jest.fn()
    ctx.scene.leave = jest.fn()
  })

  it('should send invoice for neurophoto subscription and leave scene', async () => {
    await handleBuySubscription({ ctx, isRu: false })
    const amount = 476
    expect(ctx.replyWithInvoice).toHaveBeenCalledWith(expect.objectContaining({
      title: levels[2].title_en,
      description: expect.stringContaining('Creating photos'),
      currency: 'XTR',
      prices: [{ label: 'Price', amount }],
    }))
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('should default title and description when subscription type unknown', async () => {
    ctx.session.subscription = 'unknown'
    await handleBuySubscription({ ctx, isRu: true })
    // amount undefined => payload amount_NaN, but title fallback is `${amount} ⭐️`, so title contains 'NaN ⭐️'
    expect(ctx.replyWithInvoice).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining('⭐️'),
      description: expect.stringContaining('Получите'),
      currency: 'XTR',
      prices: [{ label: 'Цена', amount: undefined }],
    }))
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})