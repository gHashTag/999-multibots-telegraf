import { getUserBalanceStats } from '@/core/supabase/getUserBalance'
import { supabase } from '@/core/supabase'

jest.mock('@/core/supabase', () => ({
  supabase: { rpc: jest.fn() },
}))

describe('getUserBalanceStats', () => {
  const rpcMock = supabase.rpc as jest.Mock
  const defaultStats = {
    stars: 0,
    total_added: 0,
    total_spent: 0,
    bonus_stars: 0,
    added_stars: 0,
    added_rub: 0,
    services: {},
    payment_methods: {},
    payments: [],
  }
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('returns default stats when telegram_id is falsy', async () => {
    // @ts-ignore
    const stats = await getUserBalanceStats(null)
    expect(stats).toEqual(defaultStats)
  })

  it('returns default stats when rpc returns error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'err' } })
    const stats = await getUserBalanceStats('123')
    expect(stats).toEqual(defaultStats)
    expect(rpcMock).toHaveBeenCalledWith('get_user_balance_stats', {
      user_telegram_id: '123',
    })
  })

  it('returns processed stats when rpc returns data', async () => {
    const rawStats = {
      stars: '10',
      total_added: '20',
      total_spent: '5',
      bonus_stars: '2',
      added_stars: '3',
      added_rub: '100',
      services: { testService: 1 },
      payment_methods: { card: 1 },
      payments: [
        {
          currency: 'USD',
          stars: '1',
          amount: '100',
          payment_date: '2025-01-01',
          type: 'test',
          description: 'desc',
          payment_method: 'card',
          status: 'ok',
        },
      ],
    }
    rpcMock.mockResolvedValue({ data: rawStats, error: null })
    const stats = await getUserBalanceStats('456')
    expect(stats.stars).toBe(10)
    expect(stats.total_added).toBe(20)
    expect(stats.total_spent).toBe(5)
    expect(stats.bonus_stars).toBe(2)
    expect(stats.added_stars).toBe(3)
    expect(stats.added_rub).toBe(100)
    expect(stats.services).toEqual(rawStats.services)
    expect(stats.payment_methods).toEqual(rawStats.payment_methods)
    expect(stats.payments).toEqual(rawStats.payments)
  })
})
