import { jest, describe, it, expect, beforeEach } from '@jest/globals'

describe('updateUserSoul', () => {
  let updateUserSoul: typeof import('@/core/supabase/updateUserSoul').updateUserSoul
  const telegram_id = '99'
  const company = 'MyCompany'
  const position = 'Dev'
  const designation = 'Senior'
  let builder: any

  beforeEach(() => {
    jest.resetModules()
    // Mock supabase client
    const { supabase } = require('@/core/supabase')
    builder = { update: jest.fn().mockReturnThis(), eq: jest.fn() }
    jest.spyOn(supabase, 'from').mockReturnValue(builder)
    // Mock console.error
    jest.spyOn(console, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    updateUserSoul = require('@/core/supabase/updateUserSoul').updateUserSoul
  })

  it('calls update and eq and resolves on success', async () => {
    builder.eq.mockResolvedValue({ error: null })
    await expect(updateUserSoul(telegram_id, company, position, designation)).resolves.toBeUndefined()
    const { supabase } = require('@/core/supabase')
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(builder.update).toHaveBeenCalledWith({ company, position, designation })
    expect(builder.eq).toHaveBeenCalledWith('telegram_id', telegram_id)
  })

  it('logs and resolves on update error', async () => {
    const err = { message: 'fail' }
    builder.eq.mockResolvedValue({ error: err })
    await expect(updateUserSoul(telegram_id, company, position, designation)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith('Ошибка в updateUserSoul:', expect.any(Error))
  })

  it('logs and resolves on exception', async () => {
    builder.update.mockImplementation(() => { throw new Error('oops') })
    await expect(updateUserSoul(telegram_id, company, position, designation)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith('Ошибка в updateUserSoul:', expect.any(Error))
  })
})