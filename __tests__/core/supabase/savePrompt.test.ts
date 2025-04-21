describe('savePrompt', () => {
  let selectChain: any
  let insertChain: any
  let mockFrom: jest.Mock
  let savePrompt: (
    prompt: string,
    model_type: string,
    media_url?: string,
    telegram_id?: number
  ) => Promise<number | null>

  beforeEach(() => {
    jest.resetModules()
    // Create chains for select (check existing) and insert
    selectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    }
    insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn(),
    }
    // Mock supabase.from to return selectChain first, then insertChain
    mockFrom = jest
      .fn()
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(insertChain)
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Suppress console.error
    jest.spyOn(console, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    savePrompt = require('@/core/supabase/savePrompt').savePrompt
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns null when select throws error', async () => {
    const selectError = new Error('select fail')
    selectChain.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: selectError,
    })
    const result = await savePrompt('p', 'm', 'url', 1)
    expect(console.error).toHaveBeenCalledWith(
      'Ошибка при проверке существующего промпта:',
      selectError
    )
    expect(result).toBeNull()
  })

  it('returns existing prompt_id when found', async () => {
    const existing = { prompt_id: 42 }
    selectChain.maybeSingle.mockResolvedValueOnce({
      data: existing,
      error: null,
    })
    const result = await savePrompt('p', 'm', 'url', 2)
    expect(result).toBe(42)
  })

  it('inserts and returns new prompt_id when not found', async () => {
    // No existing
    selectChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const newPrompt = { prompt_id: 99 }
    insertChain.single.mockResolvedValueOnce({ data: newPrompt, error: null })
    const result = await savePrompt('p', 'm', 'url', 3)
    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(insertChain.insert).toHaveBeenCalledWith({
      prompt: 'p',
      model_type: 'm',
      media_url: 'url',
      telegram_id: 3,
    })
    expect(insertChain.select).toHaveBeenCalledWith()
    expect(insertChain.single).toHaveBeenCalled()
    expect(result).toBe(99)
  })

  it('returns null when insert fails', async () => {
    selectChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const insError = new Error('insert fail')
    insertChain.single.mockResolvedValueOnce({ data: null, error: insError })
    const result = await savePrompt('p', 'm', 'url', 4)
    expect(console.error).toHaveBeenCalledWith(
      'Ошибка при сохранении промпта:',
      insError
    )
    expect(result).toBeNull()
  })
})
