
describe('updateModelTraining', () => {
  let updateModelTraining: typeof import('@/core/supabase/updateModelTraining').updateModelTraining
  const user_id = 'user1'
  const model_name = 'modelA'
  const updates = { status: 'SUCCESS', model_url: 'url', error: undefined }

  beforeEach(() => {
    jest.resetModules()
    // Load supabase client and set chainable builder for from
    const supabaseModule = require('@/core/supabase')
    const chain: any = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: jest.fn(),
    }
    supabaseModule.supabase.from = jest.fn().mockReturnValue(chain)
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    updateModelTraining = require('@/core/supabase/updateModelTraining').updateModelTraining
    // Expose chain for assertions
    ;(updateModelTraining as any).__chain = chain
  })

  it('resolves when update has no error', async () => {
    const chain = (updateModelTraining as any).__chain
    // Mock final resolution: no error
    chain.then.mockImplementation(resolve => resolve({ error: null }))
    await expect(updateModelTraining(user_id, model_name, updates)).resolves.toBeUndefined()
    // Verify chain calls
    expect(chain.update).toHaveBeenCalledWith(updates)
    expect(chain.eq).toHaveBeenCalledWith('user_id', user_id)
    expect(chain.eq).toHaveBeenCalledWith('model_name', model_name)
    expect(chain.eq).toHaveBeenCalledWith('status', 'processing')
    // Verify supabase.from was called
    const { supabase } = require('@/core/supabase')
    expect(supabase.from).toHaveBeenCalledWith('model_trainings')
  })

  it('throws when update returns error', async () => {
    const chain = (updateModelTraining as any).__chain
    // Mock final resolution: error present
    chain.then.mockImplementation(resolve => resolve({ error: { message: 'db fail' } }))
    await expect(updateModelTraining(user_id, model_name, updates)).rejects.toThrow(
      'Ошибка при обновлении записи о тренировке: db fail'
    )
  })
})