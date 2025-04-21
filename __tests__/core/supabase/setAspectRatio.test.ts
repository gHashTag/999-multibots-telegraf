describe('setAspectRatio', () => {
  let setAspectRatio: typeof import('@/core/supabase/setAspectRatio').setAspectRatio
  const mockEq = jest.fn()
  const mockUpdate = jest.fn()
  const mockFrom = jest.fn()
  const telegram_id = 123
  const aspect_ratio = '4:3'

  beforeEach(() => {
    jest.resetModules()
    mockEq.mockReset()
    mockUpdate.mockImplementation(() => ({ eq: mockEq }))
    mockFrom.mockImplementation(() => ({ update: mockUpdate }))
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      setAspectRatio = require('@/core/supabase/setAspectRatio').setAspectRatio
    })
  })

  it('returns true on successful update', async () => {
    mockEq.mockResolvedValue({ error: null })
    const res = await setAspectRatio(telegram_id, aspect_ratio)
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(mockUpdate).toHaveBeenCalledWith({ aspect_ratio })
    expect(mockEq).toHaveBeenCalledWith('telegram_id', telegram_id.toString())
    expect(res).toBe(true)
  })

  it('returns false on error', async () => {
    mockEq.mockResolvedValue({ error: { message: 'fail' } })
    const res = await setAspectRatio(telegram_id, aspect_ratio)
    expect(res).toBe(false)
  })
})
