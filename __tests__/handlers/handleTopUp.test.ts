import makeMockContext from '../utils/mockTelegrafContext'
import { defaultSession } from '@/store'

// Mock handleBuy
jest.mock('@/handlers', () => ({ handleBuy: jest.fn() }))
import { handleTopUp } from '@/handlers/paymentHandlers/handleTopUp'
import { handleBuy } from '@/handlers'

describe('handleTopUp', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls handleBuy with correct parameters for Russian', async () => {
    const ctx = makeMockContext({
      callback_query: {
        from: {
          id: 1,
          language_code: 'ru',
          is_bot: false,
          first_name: 'TestRu',
        },
      },
    } as any)
    ctx.session = { ...defaultSession }
    ;(ctx as any).match = ['top_up_50']

    await handleTopUp(ctx as any)
    expect(handleBuy).toHaveBeenCalledWith({
      ctx,
      data: 'top_up_50',
      isRu: true,
    })
  })

  it('calls handleBuy with correct parameters for English', async () => {
    const ctx = makeMockContext({
      callback_query: {
        from: {
          id: 2,
          language_code: 'en',
          is_bot: false,
          first_name: 'TestEn',
        },
      },
    } as any)
    ctx.session = { ...defaultSession }
    ;(ctx as any).match = ['top_up_50']

    await handleTopUp(ctx as any)
    expect(handleBuy).toHaveBeenCalledWith({
      ctx,
      data: 'top_up_50',
      isRu: false,
    })
  })
})
