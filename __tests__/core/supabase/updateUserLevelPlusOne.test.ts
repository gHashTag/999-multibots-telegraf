
describe('updateUserLevelPlusOne', () => {
  let updateUserLevelPlusOne: typeof import('@/core/supabase/updateUserLevelPlusOne').updateUserLevelPlusOne
  const telegram_id = 'abc'
  const level = 4
  let builder: any

  beforeEach(() => {
    jest.resetModules()
    // Mock supabase client
    const { supabase } = require('@/core/supabase')
    builder = { update: jest.fn().mockReturnThis(), eq: jest.fn(), then: jest.fn() }
    jest.spyOn(supabase, 'from').mockReturnValue(builder)
    // Mock console
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    updateUserLevelPlusOne = require('@/core/supabase/updateUserLevelPlusOne').updateUserLevelPlusOne
  })

  it('increments level and logs success when no error', async () => {
    const newData = [{ level: level + 1 }]
    builder.eq.mockReturnValue(Promise.resolve({ data: newData, error: null }))
    await expect(updateUserLevelPlusOne(telegram_id, level)).resolves.toBeUndefined()
    const { supabase } = require('@/core/supabase')
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(builder.update).toHaveBeenCalledWith({ level: level + 1 })
    expect(builder.eq).toHaveBeenCalledWith('telegram_id', telegram_id)
    expect(console.log).toHaveBeenCalledWith('Уровень пользователя обновлен:', newData)
  })

  it('logs error when update returns error', async () => {
    const err = { message: 'fail' }
    builder.eq.mockReturnValue(Promise.resolve({ data: null, error: err }))
    await expect(updateUserLevelPlusOne(telegram_id, level)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith('Ошибка обновления уровня пользователя:', err)
  })

  it('catches exception and logs it', async () => {
    builder.update.mockImplementation(() => { throw new Error('oops') })
    await expect(updateUserLevelPlusOne(telegram_id, level)).resolves.toBeUndefined()
    expect(console.log).toHaveBeenCalledWith('updateUserLevel', expect.any(Error))
  })
})