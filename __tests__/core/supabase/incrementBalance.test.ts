import { jest, describe, it, expect, beforeEach } from '@jest/globals'

describe('incrementBalance', () => {
  let incrementBalance: typeof import('@/core/supabase/incrementBalance').incrementBalance
  const mockFrom = jest.fn()
  let builderSelect: any
  let builderUpdate: any
  const telegram_id = '42'
  const amount = 10

  beforeEach(() => {
    jest.resetModules()
    // Load original supabase client
    const { supabase } = require('@/core/supabase')
    // Builders for select and update
    builderSelect = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn() }
    builderUpdate = { update: jest.fn().mockReturnThis(), eq: jest.fn() }
    // Spy on supabase.from to return builders sequentially
    jest.spyOn(supabase, 'from')
      .mockImplementationOnce(() => builderSelect)
      .mockImplementationOnce(() => builderUpdate)
    // Import module under test after spying
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    incrementBalance = require('@/core/supabase/incrementBalance').incrementBalance
  })

  it('throws when select errors or no data', async () => {
    // simulate select error
    // simulate select error
    builderSelect.single.mockResolvedValue({ data: null, error: { message: 'fail' } })
    await expect(incrementBalance({ telegram_id, amount })).rejects.toThrow('Не удалось получить текущий баланс')
  })


  it('resolves when update succeeds', async () => {
    // simulate select success
    // simulate select success
    builderSelect.single.mockResolvedValue({ data: { balance: 20 }, error: null })
    // simulate update success
    builderUpdate.eq.mockResolvedValue({ error: null })
    await expect(incrementBalance({ telegram_id, amount })).resolves.toBeUndefined()
    // verify newBalance: 20+10
    expect(builderUpdate.update).toHaveBeenCalledWith({ balance: 30 })
  })
})