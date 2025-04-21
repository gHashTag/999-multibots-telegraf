describe('getTranslation', () => {
  let getTranslation: typeof import('@/core/supabase/getTranslation').getTranslation
  // Mocks
  const mockSingle = jest.fn()
  const mockEq = jest.fn().mockReturnThis()
  const mockSelect = jest.fn().mockReturnThis()
  const mockFrom = jest.fn().mockReturnValue({ select: mockSelect })
  const ctx = {
    from: { language_code: 'en' },
    telegram: { token: 'tok1' },
  } as any
  const key = 'start'
  const gtbt = jest.fn().mockReturnValue({ bot_name: 'bot1' })
  // Fallback for key 'start' as per getFallbackTranslation
  const expectedFallback = {
    translation:
      'Добро пожаловать в NeuroBot! Бот готов помочь вам с нейросетями.',
    url: '',
  }

  beforeEach(() => {
    jest.resetModules()
    // Mock core/bot and logger
    jest.doMock('@/core/bot', () => ({
      getBotNameByToken: gtbt,
      DEFAULT_BOT_NAME: 'defaultBot',
    }))
    jest.doMock('@/utils/logger', () => ({ warn: jest.fn(), error: jest.fn() }))
    // Mock supabase
    // fetchTranslation uses supabase.from().select().eq().eq().eq().single()
    const chain = {
      select: mockSelect,
      eq: mockEq,
      single: mockSingle,
    }
    // single returns chain-like that resolves
    mockFrom.mockReturnValue(chain)
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      getTranslation = require('@/core/supabase/getTranslation').getTranslation
    })
  })

  it('returns translation when first fetch succeeds', async () => {
    mockSingle.mockResolvedValue({
      data: { translation: 't1', url: 'u1' },
      error: null,
    })
    const res = await getTranslation({ key, ctx, bot_name: 'bot1' })
    expect(res).toEqual({ translation: 't1', url: 'u1' })
  })

  it('falls back to default bot when first fetch errors and default succeeds', async () => {
    // First call error
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'e1' } })
    // Second call success
    mockSingle.mockResolvedValueOnce({
      data: { translation: 't2', url: 'u2' },
      error: null,
    })
    const res = await getTranslation({ key, ctx, bot_name: undefined })
    expect(gtbt).toHaveBeenCalledWith('tok1')
    expect(res).toEqual({ translation: 't2', url: 'u2' })
  })

  it('returns fallback when both fetches error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'e' } })
    const res = await getTranslation({ key, ctx, bot_name: undefined })
    expect(res).toEqual(expectedFallback)
  })

  it('returns fallback on exception', async () => {
    mockSelect.mockImplementation(() => {
      throw new Error('oops')
    })
    const res = await getTranslation({ key, ctx, bot_name: 'bot1' })
    expect(res).toEqual(expectedFallback)
  })
})
