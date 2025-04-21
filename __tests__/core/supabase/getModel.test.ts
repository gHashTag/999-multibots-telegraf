
describe('getModel', () => {
  let builder: any
  let mockFrom: jest.Mock
  let getModel: (telegram_id: string) => Promise<string>

  beforeEach(() => {
    jest.resetModules()
    // Build supabase query chain
    builder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    }
    mockFrom = jest.fn(() => builder)
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getModel = require('@/core/supabase/getModel').getModel
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns model when data exists', async () => {
    builder.single.mockResolvedValueOnce({ data: { model: 'testModel' }, error: null })
    const result = await getModel('42')
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(builder.select).toHaveBeenCalledWith('model')
    expect(builder.eq).toHaveBeenCalledWith('telegram_id', '42')
    expect(builder.single).toHaveBeenCalled()
    expect(result).toBe('testModel')
  })

  it('throws error when response has error', async () => {
    const err = new Error('fetch failed')
    builder.single.mockResolvedValueOnce({ data: null, error: err })
    await expect(getModel('100')).rejects.toThrow(`Error getModel: ${err}`)
  })

  it('throws error when response has no data', async () => {
    builder.single.mockResolvedValueOnce({ data: null, error: null })
    await expect(getModel('200')).rejects.toThrow('Error getModel: null')
  })

  it('throws error when supabase chain rejects', async () => {
    const err = new Error('network')
    builder.single.mockRejectedValueOnce(err)
    await expect(getModel('300')).rejects.toThrow(`Error getModel: ${err}`)
  })
})