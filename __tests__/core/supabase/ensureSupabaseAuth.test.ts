
describe('ensureSupabaseAuth', () => {
  let mockLimit: jest.Mock
  let mockSelect: jest.Mock
  let mockFrom: jest.Mock
  let ensureSupabaseAuth: () => Promise<void>

  beforeEach(() => {
    jest.resetModules()
    // Setup Supabase from chain mocks
    mockLimit = jest.fn()
    mockSelect = jest.fn(() => ({ limit: mockLimit }))
    mockFrom = jest.fn(() => ({ select: mockSelect }))
    jest.doMock('@/core/supabase', () => ({
      supabase: {
        from: mockFrom
      }
    }))
    // Suppress console.error
    jest.spyOn(console, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ensureSupabaseAuth = require('@/core/supabase/ensureSupabaseAuth').ensureSupabaseAuth
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('resolves when no error from supabase', async () => {
    mockLimit.mockResolvedValueOnce({ error: null })
    await expect(ensureSupabaseAuth()).resolves.toBeUndefined()
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(mockSelect).toHaveBeenCalledWith('count', { count: 'exact', head: true })
    expect(mockLimit).toHaveBeenCalledWith(1)
  })

  it('throws new Error when supabase returns error', async () => {
    const err = new Error('fail')
    mockLimit.mockResolvedValueOnce({ error: err })
    await expect(ensureSupabaseAuth()).rejects.toThrow('Не удалось подключиться к Supabase')
    expect(console.error).toHaveBeenCalledWith('Supabase connection error:', err)
  })

  it('throws new Error on exception', async () => {
    const err = new Error('network')
    mockLimit.mockRejectedValueOnce(err)
    await expect(ensureSupabaseAuth()).rejects.toThrow('Не удалось подключиться к Supabase')
    expect(console.error).toHaveBeenCalledWith('Supabase connection error:', err)
  })
})