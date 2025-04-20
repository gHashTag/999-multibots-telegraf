import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock starAmounts array
jest.mock('@/price/helpers', () => ({ starAmounts: [5, 10, 20] }))
const { starAmounts } = require('@/price/helpers')

import { handleBuy } from '@/handlers/handleBuy'

describe('handlers/handleBuy', () => {
  let ctx: any

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = {
      replyWithInvoice: jest.fn().mockResolvedValue(undefined)
    }
  })

  it('sends invoice for matching amount in English', async () => {
    await handleBuy({ ctx, data: 'some_top_up_10', isRu: false })
    expect(ctx.replyWithInvoice).toHaveBeenCalledTimes(1)
    const invoice = ctx.replyWithInvoice.mock.calls[0][0]
    expect(invoice.title).toBe('10 ⭐️')
    expect(invoice.description).toContain('Get 10 stars')
    expect(invoice.payload).toMatch(/^10_\d+$/)
    expect(invoice.currency).toBe('XTR')
    expect(invoice.prices).toEqual([{ label: 'Price', amount: 10 }])
  })

  it('sends invoice for matching amount in Russian', async () => {
    await handleBuy({ ctx, data: 'prefix_top_up_5', isRu: true })
    expect(ctx.replyWithInvoice).toHaveBeenCalledTimes(1)
    const invoice = ctx.replyWithInvoice.mock.calls[0][0]
    expect(invoice.title).toBe('5 ⭐️')
    expect(invoice.description).toContain('Получите 5 звезд')
    expect(invoice.prices).toEqual([{ label: 'Цена', amount: 5 }])
  })

  it('does not send invoice when data does not match any amount', async () => {
    await handleBuy({ ctx, data: 'no_match', isRu: false })
    expect(ctx.replyWithInvoice).not.toHaveBeenCalled()
  })

  it('propagates error when replyWithInvoice throws', async () => {
    ctx.replyWithInvoice = jest.fn().mockRejectedValue(new Error('fail'))
    await expect(
      handleBuy({ ctx, data: 'prefix_top_up_20', isRu: false })
    ).rejects.toThrow('fail')
  })
})