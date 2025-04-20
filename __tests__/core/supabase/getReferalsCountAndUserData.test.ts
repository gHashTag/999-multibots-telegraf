
describe('getReferalsCountAndUserData', () => {
  let getReferalsCountAndUserData: typeof import('@/core/supabase/getReferalsCountAndUserData').getReferalsCountAndUserData
  const mockBuilderUser: any = {}
  const mockBuilderRef: any = {}
  const mockFrom = jest.fn()
  const telegram_id = '100'
  const userData = { user_id: 'u1', level: 5, subscription: 'premium' }
  const refs = [{ inviter: 'u1' }, { inviter: 'u1' }]

  beforeEach(() => {
    jest.resetModules()
    // Setup builder for first query (user lookup)
    mockBuilderUser.eq = jest.fn().mockReturnThis()
    mockBuilderUser.single = jest.fn()
    // Setup builder for referral query
    mockBuilderRef.eq = jest.fn()
    // supabase.from mock
    mockFrom.mockImplementation(() => ({
      select: (col: string) => (col === '*' ? mockBuilderUser : mockBuilderRef),
    }))
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      getReferalsCountAndUserData = require('@/core/supabase/getReferalsCountAndUserData').getReferalsCountAndUserData
    })
  })

  it('returns default when user lookup fails', async () => {
    mockBuilderUser.single.mockResolvedValue({ data: null, error: { message: 'fail' } })
    const res = await getReferalsCountAndUserData(telegram_id)
    expect(res).toEqual({ count: 0, subscription: 'stars', level: 0, userData: null, isExist: false })
  })

  it('returns default when referral query errors', async () => {
    // First successful user lookup
    mockBuilderUser.single.mockResolvedValue({ data: userData, error: null })
    // Second query error
    mockBuilderRef.eq.mockReturnValue(Promise.resolve({ data: null, error: { message: 'fail' } }))
    const res = await getReferalsCountAndUserData(telegram_id)
    expect(res).toEqual({ count: 0, subscription: 'stars', level: 0, userData: null, isExist: false })
  })

  it('returns correct count and user data on success', async () => {
    mockBuilderUser.single.mockResolvedValue({ data: userData, error: null })
    mockBuilderRef.eq.mockReturnValue(Promise.resolve({ data: refs, error: null }))
    const res = await getReferalsCountAndUserData(telegram_id)
    expect(res).toEqual({
      count: refs.length,
      level: userData.level,
      subscription: userData.subscription,
      userData: userData,
      isExist: true,
    })
  })
})