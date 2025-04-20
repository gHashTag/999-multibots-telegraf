import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

describe('saveUserEmail', () => {
  let builder: any
  let mockFrom: jest.Mock
  let saveUserEmail: (telegram_id: string, email: string) => Promise<void>

  beforeEach(() => {
    jest.resetModules()
    // Create supabase.from chain with update and eq
    const eqMock = jest.fn()
    builder = {
      update: jest.fn(() => ({ eq: eqMock })),
    }
    // eqMock resolves to error object
    mockFrom = jest.fn(() => builder)
    jest.doMock('@/core/supabase', () => ({ supabase: { from: mockFrom } }))
    // Suppress console.error
    jest.spyOn(console, 'error').mockImplementation(() => {})
    // Import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    saveUserEmail = require('@/core/supabase/saveUserEmail').saveUserEmail
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('resolves when update succeeds', async () => {
    // Mock eq to resolve no error
    const eqMock = builder.update().eq
    eqMock.mockResolvedValueOnce({ error: null })
    await expect(saveUserEmail('42', 'a@b.com')).resolves.toBeUndefined()
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(builder.update).toHaveBeenCalledWith({ email: 'a@b.com' })
    expect(eqMock).toHaveBeenCalledWith('telegram_id', '42')
  })

  it('throws and logs error when update fails', async () => {
    const eqMock = builder.update().eq
    const err = new Error('upd fail')
    eqMock.mockResolvedValueOnce({ error: err })
    await expect(saveUserEmail('99', 'c@d.com')).rejects.toThrow('Не удалось сохранить e-mail пользователя')
    expect(console.error).toHaveBeenCalledWith('Ошибка при сохранении e-mail:', err)
  })
})