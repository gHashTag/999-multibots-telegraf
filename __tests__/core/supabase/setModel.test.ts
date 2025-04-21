
describe('setModel', () => {
  let setModel: typeof import('@/core/supabase/setModel').setModel
  const telegram_id = '42'
  const model = 'abc'
  let builder: any

  beforeEach(() => {
    jest.resetModules()
    // Mock supabase client
    const { supabase } = require('@/core/supabase')
    // Create builder with chainable methods
    builder = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn(),
    }
    // Spy on supabase.from to return our builder
    jest.spyOn(supabase, 'from').mockReturnValue(builder)
    // Import function under test after mocking
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    setModel = require('@/core/supabase/setModel').setModel
  })

  it('calls update, eq, and select, and resolves', async () => {
    builder.select.mockResolvedValue({ data: { model }, error: null })
    await expect(setModel(telegram_id, model)).resolves.toBeUndefined()
    expect(builder.update).toHaveBeenCalledWith({ model })
    expect(builder.eq).toHaveBeenCalledWith('telegram_id', telegram_id)
    expect(builder.select).toHaveBeenCalledWith('*')
  })

  it('throws when supabase.select rejects', async () => {
    builder.select.mockRejectedValue(new Error('fail'))
    await expect(setModel(telegram_id, model)).rejects.toThrow(
      'Error setModel: Error: fail'
    )
  })
})