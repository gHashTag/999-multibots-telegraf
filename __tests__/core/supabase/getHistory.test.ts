describe('getHistory', () => {
  let getHistory: typeof import('@/core/supabase/getHistory').getHistory
  let chain: any
  const mockFrom = jest.fn()
  const brand = 'b',
    command = 'c',
    type = 't'
  const sampleData = [{ id: 1 }, { id: 2 }]

  beforeEach(() => {
    jest.resetModules()
    // Create a thenable chain for supabase query
    chain = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn(),
    }
    mockFrom.mockImplementation(() => chain)
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      getHistory = require('@/core/supabase/getHistory').getHistory
    })
  })

  it('returns data when query successful', async () => {
    // Mock final resolution for success
    chain.then.mockImplementation(resolve =>
      resolve({ data: sampleData, error: null })
    )
    const res = await getHistory(brand, command, type)
    expect(mockFrom).toHaveBeenCalledWith('clips')
    expect(chain.select).toHaveBeenCalledWith('*')
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(10)
    expect(chain.eq).toHaveBeenCalledWith('brand', brand)
    expect(chain.eq).toHaveBeenCalledWith('command', command)
    expect(chain.eq).toHaveBeenCalledWith('type', type)
    expect(res).toEqual(sampleData)
  })

  it('returns empty array when error', async () => {
    // Mock error resolution
    chain.then.mockImplementation(resolve =>
      resolve({ data: null, error: { message: 'fail' } })
    )
    const res = await getHistory(brand, command, type)
    expect(res).toEqual([])
  })
})
