
describe('getTelegramIdByUserId', () => {
  let getTelegramIdByUserId: typeof import('@/core/supabase/getTelegramIdByUserId').getTelegramIdByUserId
  let chain: any
  const mockFrom = jest.fn()
  const userId = 'u1'

  beforeEach(() => {
    jest.resetModules()
    chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: jest.fn(),
    }
    mockFrom.mockImplementation(() => chain)
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      getTelegramIdByUserId = require('@/core/supabase/getTelegramIdByUserId').getTelegramIdByUserId
    })
  })

  it('returns telegram_id when found', async () => {
    chain.then.mockImplementation(resolve => resolve({ data: { telegram_id: 999 }, error: null }))
    const res = await getTelegramIdByUserId(userId)
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(chain.select).toHaveBeenCalledWith('telegram_id')
    expect(chain.eq).toHaveBeenCalledWith('user_id', userId)
    expect(res).toBe(999)
  })

  it('returns null on error', async () => {
    chain.then.mockImplementation(resolve => resolve({ data: null, error: { message: 'fail' } }))
    const res = await getTelegramIdByUserId(userId)
    expect(res).toBeNull()
  })

  it('returns null when no data', async () => {
    chain.then.mockImplementation(resolve => resolve({ data: {}, error: null }))
    const res = await getTelegramIdByUserId(userId)
    expect(res).toBeNull()
  })

  it('throws on exception', async () => {
    chain.select.mockImplementation(() => { throw new Error('oops') })
    await expect(getTelegramIdByUserId(userId)).rejects.toThrow('oops')
  })
})