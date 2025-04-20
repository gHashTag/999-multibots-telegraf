
describe('createModelTraining', () => {
  let mockInsert: jest.Mock
  let createModelTraining: (training: any) => Promise<void>

  beforeEach(() => {
    jest.resetModules()
    // Mock supabase.from().insert()
    mockInsert = jest.fn()
    const mockFrom = jest.fn(() => ({ insert: mockInsert }))
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    createModelTraining = require('@/core/supabase/createModelTraining').createModelTraining
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('resolves when insert succeeds', async () => {
    mockInsert.mockResolvedValueOnce({ error: null })
    const training = {
      user_id: 'u1',
      model_name: 'm1',
      trigger_word: 't1',
      zip_url: 'http://zip',
    }
    await expect(createModelTraining(training)).resolves.toBeUndefined()
    expect(mockInsert).toHaveBeenCalledWith(training)
  })

  it('throws error when insert fails', async () => {
    const supabaseError = new Error('db error')
    mockInsert.mockResolvedValueOnce({ error: supabaseError })
    const training = { user_id: 'u2', model_name: 'm2', trigger_word: 't2', zip_url: 'http://zip2' }
    await expect(createModelTraining(training)).rejects.toThrow(
      `Ошибка при создании записи о тренировке: ${supabaseError.message}`
    )
  })
})