import makeMockContext from '../utils/mockTelegrafContext'
import { processBalanceOperation } from '../../src/price/helpers/processBalanceOperation'
import * as supabase from '../../src/core/supabase'

describe('processBalanceOperation', () => {
  const telegram_id = 1
  let ctx = makeMockContext()
  beforeEach(() => {
    ctx = makeMockContext()
    jest.clearAllMocks()
  })

  it('returns error when balance insufficient', async () => {
    jest.spyOn(supabase, 'getUserBalance').mockResolvedValue(5)
    const res = await processBalanceOperation({
      ctx,
      telegram_id,
      paymentAmount: 10,
      is_ru: false,
    })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Insufficient funds/)
  })

  it('returns success and updates balance', async () => {
    jest.spyOn(supabase, 'getUserBalance').mockResolvedValue(20)
    const spyUpdate = jest.spyOn(supabase, 'updateUserBalance').mockResolvedValue(undefined)
    const res = await processBalanceOperation({
      ctx,
      telegram_id,
      paymentAmount: 5,
      is_ru: true,
    })
    expect(res.success).toBe(true)
    expect(res.newBalance).toBe(15)
    expect(spyUpdate).toHaveBeenCalledWith(telegram_id, 15)
  })
})