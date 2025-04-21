
// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { updateUserSubscription } from '@/core/supabase/updateUserSubscription'

describe('updateUserSubscription', () => {
  const userId = '55'
  const subscription = 'pro'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('resolves data on successful update', async () => {
    const data = [{ telegram_id: userId, subscription }]
    const eqMock = jest.fn()
    const updateReturn = { data, error: null }
    const updateMock = jest.fn().mockResolvedValue(updateReturn)
    ;(supabase.from as jest.Mock).mockReturnValue({ update: updateMock, eq: eqMock })
    const result = await updateUserSubscription(userId, subscription)
    expect(updateMock).toHaveBeenCalledWith({ subscription })
    expect(eqMock).toHaveBeenCalledWith('telegram_id', userId)
    expect(result).toBe(data)
  })

  it('throws error when update returns error', async () => {
    const err = { message: 'errSub' }
    const eqMock = jest.fn()
    const updateMock = jest.fn().mockResolvedValue({ data: null, error: err })
    ;(supabase.from as jest.Mock).mockReturnValue({ update: updateMock, eq: eqMock })
    await expect(updateUserSubscription(userId, subscription)).rejects.toBe(err)
  })

  it('throws error on unexpected exception', async () => {
    ;(supabase.from as jest.Mock).mockImplementation(() => { throw new Error('boom') })
    await expect(updateUserSubscription(userId, subscription)).rejects.toThrow('boom')
  })
})