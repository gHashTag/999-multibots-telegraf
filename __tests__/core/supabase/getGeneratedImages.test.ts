
describe('getGeneratedImages', () => {
  let mockSingle: jest.Mock
  let mockEq: jest.Mock
  let mockSelect: jest.Mock
  let mockFrom: jest.Mock
  let getGeneratedImages: (id: number) => Promise<{ count: number; limit: number }>

  beforeEach(() => {
    jest.resetModules()
    // Mock supabase.from chain
    mockSingle = jest.fn()
    mockEq = jest.fn(() => ({ single: mockSingle }))
    mockSelect = jest.fn(() => ({ eq: mockEq }))
    mockFrom = jest.fn(() => ({ select: mockSelect }))
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Suppress console.log
    jest.spyOn(console, 'log').mockImplementation(() => {})
    // Import function
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getGeneratedImages = require('@/core/supabase/getGeneratedImages').getGeneratedImages
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns count and limit when data exists', async () => {
    const data = { count: '5', limit: '10' }
    mockSingle.mockResolvedValueOnce({ data, error: null })
    const result = await getGeneratedImages(42)
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(mockSelect).toHaveBeenCalledWith('count, limit')
    expect(mockEq).toHaveBeenCalledWith('telegram_id', '42')
    expect(result).toEqual({ count: 5, limit: 10 })
  })

  it('returns default when error occurs', async () => {
    const err = new Error('db error')
    mockSingle.mockResolvedValueOnce({ data: null, error: err })
    const result = await getGeneratedImages(100)
    expect(console.log).toHaveBeenCalledWith('Ошибка при получении count для telegram_id:', err)
    expect(result).toEqual({ count: 0, limit: 2 })
  })

  it('returns default when no data and no error', async () => {
    mockSingle.mockResolvedValueOnce({ data: undefined, error: null })
    const result = await getGeneratedImages(7)
    expect(result).toEqual({ count: 0, limit: 2 })
  })
})