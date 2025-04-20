
// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { updateUserSoul } from '@/core/supabase/updateUserSoul'

describe('updateUserSoul', () => {
  const telegram_id = '10'
  const company = 'Comp'
  const position = 'Pos'
  const designation = 'Des'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('calls supabase.update with correct data and handles success', async () => {
    const eqMock = jest.fn()
    const updateMock = jest.fn().mockReturnValue({ eq: eqMock })
    ;(supabase.from as jest.Mock).mockReturnValue({ update: updateMock })
    await expect(updateUserSoul(telegram_id, company, position, designation)).resolves.toBeUndefined()
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(updateMock).toHaveBeenCalledWith({ company, position, designation })
    expect(eqMock).toHaveBeenCalledWith('telegram_id', telegram_id)
  })

  it('logs error when supabase update returns error and does not throw', async () => {
    const errorObj = { message: 'fail' }
    const eqMock = jest.fn()
    const updateMock = jest.fn().mockReturnValue({ error: errorObj })
    ;(supabase.from as jest.Mock).mockReturnValue({ update: updateMock })
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(updateUserSoul(telegram_id, company, position, designation)).resolves.toBeUndefined()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Ошибка в updateUserSoul:', expect.any(Error))
    consoleErrorSpy.mockRestore()
  })
})