
// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { isLimitAi } from '@/core/supabase/isLimitAi'

describe('isLimitAi', () => {
  const telegram_id = '100'
  const today = new Date().toISOString().split('T')[0]
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns false when user query error', async () => {
    // user query error
    const singleUser = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } })
    const eqUser = () => ({ single: singleUser })
    const selectUser = () => ({ eq: eqUser })
    ;(supabase.from as jest.Mock).mockReturnValue({ select: selectUser })
    const result = await isLimitAi(telegram_id)
    expect(result).toBe(false)
  })

  it('returns false when limit query error not PGRST116', async () => {
    // user ok
    const singleUser = jest.fn().mockResolvedValue({ data: { user_id: 1 }, error: null })
    const eqUser = () => ({ single: singleUser })
    const selectUser = () => ({ eq: eqUser })
    // limit error
    const limitErr = { code: 'OTHER' }
    const singleLimit = jest.fn().mockResolvedValue({ data: null, error: limitErr })
    const limitChain = () => ({ single: singleLimit })
    const orderLimit = () => ({ limit: () => limitChain() })
    const eqLimit = () => ({ order: orderLimit })
    const selectLimit = () => ({ eq: eqLimit })
    const fromMock = supabase.from as jest.Mock
    fromMock.mockReturnValueOnce({ select: selectUser })
    fromMock.mockReturnValueOnce({ select: selectLimit })
    const result = await isLimitAi(telegram_id)
    expect(result).toBe(false)
  })

  it('inserts new record when no limitData or date mismatch, return false on success', async () => {
    // user ok
    const singleUser = jest.fn().mockResolvedValue({ data: { user_id: 2 }, error: null })
    const eqUser = () => ({ single: singleUser })
    const selectUser = () => ({ eq: eqUser })
    // no limitData
    const singleLimit = jest.fn().mockResolvedValue({ data: null, error: null })
    const limitChain = () => ({ single: singleLimit })
    const orderLimit = () => ({ limit: () => limitChain() })
    const eqLimit = () => ({ order: orderLimit })
    const selectLimit = () => ({ eq: eqLimit })
    // insert success
    const insertFn = jest.fn().mockResolvedValue({ error: null })
    const fromMock = supabase.from as jest.Mock
    fromMock.mockReturnValueOnce({ select: selectUser })  // users
    fromMock.mockReturnValueOnce({ select: selectLimit }) // ai_requests select
    fromMock.mockReturnValueOnce({ insert: insertFn })    // ai_requests insert
    const result = await isLimitAi(telegram_id)
    expect(insertFn).toHaveBeenCalledWith({ user_id: 2, count: 1, created_at: expect.any(String) })
    expect(result).toBe(false)
  })

  it('returns false when insert new record fails', async () => {
    // user ok
    const singleUser = jest.fn().mockResolvedValue({ data: { user_id: 3 }, error: null })
    const eqUser = () => ({ single: singleUser })
    const selectUser = () => ({ eq: eqUser })
    // no limitData
    const singleLimit = jest.fn().mockResolvedValue({ data: null, error: null })
    const eqLimit = () => ({ order: () => ({ limit: () => ({ single: singleLimit }) }) })
    const selectLimit = () => ({ eq: eqLimit })
    // insert error
    const insertFn = jest.fn().mockResolvedValue({ error: { message: 'fail' } })
    const fromMock = supabase.from as jest.Mock
    fromMock.mockReturnValueOnce({ select: selectUser })
    fromMock.mockReturnValueOnce({ select: selectLimit })
    fromMock.mockReturnValueOnce({ insert: insertFn })
    const result = await isLimitAi(telegram_id)
    expect(result).toBe(false)
  })

  it('updates existing record when count < limit and returns false', async () => {
    // user ok
    const singleUser = jest.fn().mockResolvedValue({ data: { user_id: 4 }, error: null })
    const eqUser = () => ({ single: singleUser })
    const selectUser = () => ({ eq: eqUser })
    // limitData with count < dailyLimit
    const limitData = { id: 7, user_id: 4, count: 1, created_at: today + 'T00:00:00.000Z' }
    const singleLimit = jest.fn().mockResolvedValue({ data: limitData, error: null })
    const eqLimit = () => ({ order: () => ({ limit: () => ({ single: singleLimit }) }) })
    const selectLimit = () => ({ eq: eqLimit })
    // update success
    const eqUpdate = jest.fn().mockReturnValue({ error: null })
    const updateFn = jest.fn().mockReturnValue({ eq: eqUpdate })
    const fromMock = supabase.from as jest.Mock
    fromMock.mockReturnValueOnce({ select: selectUser })
    fromMock.mockReturnValueOnce({ select: selectLimit })
    fromMock.mockReturnValueOnce({ update: updateFn })
    const result = await isLimitAi(telegram_id)
    expect(updateFn).toHaveBeenCalledWith({ count: 2 })
    expect(eqUpdate).toHaveBeenCalledWith('id', limitData.id)
    expect(result).toBe(false)
  })

  it('returns true when limit reached', async () => {
    // user ok
    const singleUser = jest.fn().mockResolvedValue({ data: { user_id: 5 }, error: null })
    const selectUser = () => ({ eq: () => ({ single: singleUser }) })
    // limitData with count >= dailyLimit
    const limitData = { id: 8, user_id: 5, count: 3, created_at: today + 'T00:00:00.000Z' }
    const singleLimit = jest.fn().mockResolvedValue({ data: limitData, error: null })
    const selectLimit = () => ({ eq: () => ({ order: () => ({ limit: () => ({ single: singleLimit }) }) }) })
    const fromMock = supabase.from as jest.Mock
    fromMock.mockReturnValueOnce({ select: selectUser })
    fromMock.mockReturnValueOnce({ select: selectLimit })
    const result = await isLimitAi(telegram_id)
    expect(result).toBe(true)
  })
})