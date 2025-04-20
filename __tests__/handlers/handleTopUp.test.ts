import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock handleBuy
jest.mock('@/handlers', () => ({ handleBuy: jest.fn() }))
import { handleTopUp } from '@/handlers/paymentHandlers/handleTopUp'
import { handleBuy } from '@/handlers'

describe('handleTopUp', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // Simulate match array
    ;(ctx as any).match = ['top_up_50']
    ctx.from = { language_code: 'ru' } as any
  })

  it('calls handleBuy with correct parameters for Russian', async () => {
    await handleTopUp(ctx as any)
    expect(handleBuy).toHaveBeenCalledWith({
      ctx,
      data: 'top_up_50',
      isRu: true,
    })
  })

  it('calls handleBuy with correct parameters for English', async () => {
    ctx.from.language_code = 'en'
    await handleTopUp(ctx as any)
    expect(handleBuy).toHaveBeenCalledWith({
      ctx,
      data: 'top_up_50',
      isRu: false,
    })
  })
})