import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getUserBalanceStatsOptimized,
  getBalanceTrends,
  getBotStatisticsSummary,
  refreshDailyBalanceStats,
  optimizePaymentData,
  getDailyBalanceStats,
  type OptimizedBalanceStats,
  type BalanceTrends,
  type BotStatisticsSummary,
} from '@/core/supabase/getUserBalanceStatsOptimized'
import { supabase } from '@/core/supabase/client'
import { logger } from '@/utils/logger'

// Мокаем зависимости
vi.mock('@/core/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('getUserBalanceStatsOptimized', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Основная функциональность', () => {
    it('должна успешно получать статистику баланса пользователя', async () => {
      // Arrange
      const mockStats: OptimizedBalanceStats = {
        current_balance: 2303,
        total_real_income: 1303,
        total_bonus_income: 1000,
        total_outcome: 500,
        total_transactions: 10,
        payment_methods: {
          rubles: {
            stars: 1303,
            amount: 2999,
            count: 1,
          },
          telegram_stars: {
            stars: 0,
            count: 0,
          },
        },
        services_breakdown: [
          {
            service: 'text_to_image',
            count: 5,
            total_stars: 300,
            avg_stars: 60,
            percentage: 60,
            last_used: '2025-08-24T12:00:00Z',
          },
          {
            service: 'voice_generation',
            count: 3,
            total_stars: 200,
            avg_stars: 66.67,
            percentage: 40,
            last_used: '2025-08-23T10:00:00Z',
          },
        ],
        recent_topups: [
          {
            date: '2025-08-19T17:06:03.596577+00:00',
            stars: 1303,
            amount: 2999,
            currency: 'RUB',
            payment_method: 'Robokassa',
            description: 'Payment via Robokassa',
          },
        ],
        recent_expenses: [
          {
            date: '2025-08-24T12:00:00Z',
            stars: 60,
            service: 'text_to_image',
            description: 'DALLE generation',
          },
        ],
      }

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: mockStats,
        error: null,
      } as any)

      // Act
      const result = await getUserBalanceStatsOptimized('223757230')

      // Assert
      expect(result).toEqual(mockStats)
      expect(supabase.rpc).toHaveBeenCalledWith(
        'get_user_balance_stats_optimized',
        {
          p_telegram_id: 223757230,
          p_bot_name: null,
          p_limit_services: 10,
          p_limit_transactions: 5,
        }
      )
      expect(logger.info).toHaveBeenCalledWith(
        '[getUserBalanceStatsOptimized] Fetching optimized stats',
        expect.any(Object)
      )
    })

    it('должна передавать параметры бота и лимитов', async () => {
      // Arrange
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { current_balance: 100 },
        error: null,
      } as any)

      // Act
      await getUserBalanceStatsOptimized('123456', 'test_bot', 20, 10)

      // Assert
      expect(supabase.rpc).toHaveBeenCalledWith(
        'get_user_balance_stats_optimized',
        {
          p_telegram_id: 123456,
          p_bot_name: 'test_bot',
          p_limit_services: 20,
          p_limit_transactions: 10,
        }
      )
    })

    it('должна обрабатывать ошибку от БД', async () => {
      // Arrange
      const mockError = new Error('Database error')
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: mockError,
      } as any)

      // Act
      const result = await getUserBalanceStatsOptimized('123456')

      // Assert
      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        '[getUserBalanceStatsOptimized] Error calling RPC function',
        expect.objectContaining({
          error: 'Database error',
        })
      )
    })

    it('должна обрабатывать отсутствие данных', async () => {
      // Arrange
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: null,
      } as any)

      // Act
      const result = await getUserBalanceStatsOptimized('123456')

      // Assert
      expect(result).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(
        '[getUserBalanceStatsOptimized] No data returned',
        expect.any(Object)
      )
    })

    it('должна обрабатывать исключения', async () => {
      // Arrange
      vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error('Network error'))

      // Act
      const result = await getUserBalanceStatsOptimized('123456')

      // Assert
      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        '[getUserBalanceStatsOptimized] Unexpected error',
        expect.objectContaining({
          error: 'Network error',
        })
      )
    })
  })

  describe('Граничные случаи', () => {
    it('должна корректно обрабатывать пустой баланс', async () => {
      // Arrange
      const emptyStats: OptimizedBalanceStats = {
        current_balance: 0,
        total_real_income: 0,
        total_bonus_income: 0,
        total_outcome: 0,
        total_transactions: 0,
        payment_methods: {
          rubles: { stars: 0, amount: 0, count: 0 },
          telegram_stars: { stars: 0, count: 0 },
        },
        services_breakdown: [],
        recent_topups: [],
        recent_expenses: [],
      }

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: emptyStats,
        error: null,
      } as any)

      // Act
      const result = await getUserBalanceStatsOptimized('999999')

      // Assert
      expect(result).toEqual(emptyStats)
    })

    it('должна обрабатывать отрицательный баланс', async () => {
      // Arrange
      const negativeBalance: OptimizedBalanceStats = {
        current_balance: -100,
        total_real_income: 50,
        total_bonus_income: 0,
        total_outcome: 150,
        total_transactions: 5,
        payment_methods: {
          rubles: { stars: 50, amount: 100, count: 1 },
          telegram_stars: { stars: 0, count: 0 },
        },
        services_breakdown: [],
        recent_topups: [],
        recent_expenses: [],
      }

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: negativeBalance,
        error: null,
      } as any)

      // Act
      const result = await getUserBalanceStatsOptimized('777777')

      // Assert
      expect(result?.current_balance).toBe(-100)
    })
  })
})

describe('getBalanceTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должна получать тренды за неделю по умолчанию', async () => {
    // Arrange
    const mockTrends: BalanceTrends = {
      period: 'week',
      timeline: [
        {
          period: '2025-08-18',
          income: 100,
          outcome: 50,
          balance: 50,
          transactions: 5,
        },
        {
          period: '2025-08-19',
          income: 200,
          outcome: 80,
          balance: 120,
          transactions: 8,
        },
      ],
      service_trends: [
        {
          service: 'text_to_image',
          usage_count: 10,
          total_spent: 500,
          avg_per_use: 50,
        },
      ],
      summary: {
        total_income: 300,
        total_outcome: 130,
        transaction_count: 13,
        avg_transaction: 33.08,
      },
    }

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: mockTrends,
      error: null,
    } as any)

    // Act
    const result = await getBalanceTrends('123456')

    // Assert
    expect(result).toEqual(mockTrends)
    expect(supabase.rpc).toHaveBeenCalledWith('get_balance_trends', {
      p_telegram_id: 123456,
      p_period: 'week',
      p_bot_name: null,
    })
  })

  it('должна поддерживать разные периоды', async () => {
    // Arrange
    const periods: Array<'day' | 'week' | 'month' | 'year'> = [
      'day',
      'week',
      'month',
      'year',
    ]

    for (const period of periods) {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { period },
        error: null,
      } as any)

      // Act
      await getBalanceTrends('123456', period)

      // Assert
      expect(supabase.rpc).toHaveBeenCalledWith('get_balance_trends', {
        p_telegram_id: 123456,
        p_period: period,
        p_bot_name: null,
      })
    }
  })

  it('должна обрабатывать ошибки', async () => {
    // Arrange
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: new Error('Trends error'),
    } as any)

    // Act
    const result = await getBalanceTrends('123456', 'month')

    // Assert
    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('getBotStatisticsSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должна получать статистику бота', async () => {
    // Arrange
    const mockSummary: BotStatisticsSummary = {
      summary: {
        unique_users: 100,
        total_transactions: 500,
        total_income: 10000,
        total_outcome: 8000,
        total_cost: 1000,
        total_bonuses: 500,
      },
      top_users: [
        { telegram_id: 123456, transactions: 50, spent: 1000 },
        { telegram_id: 789012, transactions: 45, spent: 900 },
      ],
      services: [
        { service_type: 'text_to_image', count: 200, revenue: 5000, cost: 500 },
        {
          service_type: 'voice_generation',
          count: 100,
          revenue: 3000,
          cost: 300,
        },
      ],
      period: {
        start: '2025-08-01',
        end: '2025-08-24',
      },
    }

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: mockSummary,
      error: null,
    } as any)

    // Act
    const startDate = new Date('2025-08-01')
    const endDate = new Date('2025-08-24')
    const result = await getBotStatisticsSummary('test_bot', startDate, endDate)

    // Assert
    expect(result).toEqual(mockSummary)
    expect(supabase.rpc).toHaveBeenCalledWith('get_bot_statistics_summary', {
      p_bot_name: 'test_bot',
      p_start_date: startDate.toISOString(),
      p_end_date: endDate.toISOString(),
    })
  })

  it('должна работать без дат', async () => {
    // Arrange
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { summary: {} },
      error: null,
    } as any)

    // Act
    await getBotStatisticsSummary('test_bot')

    // Assert
    expect(supabase.rpc).toHaveBeenCalledWith('get_bot_statistics_summary', {
      p_bot_name: 'test_bot',
      p_start_date: null,
      p_end_date: null,
    })
  })
})

describe('refreshDailyBalanceStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должна обновлять материализованное представление', async () => {
    // Arrange
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      error: null,
    } as any)

    // Act
    const result = await refreshDailyBalanceStats()

    // Assert
    expect(result).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('refresh_daily_balance_stats')
    expect(logger.info).toHaveBeenCalledWith(
      '[refreshDailyBalanceStats] Successfully refreshed view'
    )
  })

  it('должна возвращать false при ошибке', async () => {
    // Arrange
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      error: new Error('Refresh failed'),
    } as any)

    // Act
    const result = await refreshDailyBalanceStats()

    // Assert
    expect(result).toBe(false)
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('optimizePaymentData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должна оптимизировать данные платежей', async () => {
    // Arrange
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      error: null,
    } as any)

    // Act
    const result = await optimizePaymentData()

    // Assert
    expect(result).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('optimize_payment_data')
    expect(logger.info).toHaveBeenCalledWith(
      '[optimizePaymentData] Successfully optimized payment data'
    )
  })

  it('должна обрабатывать ошибки оптимизации', async () => {
    // Arrange
    vi.mocked(supabase.rpc).mockRejectedValueOnce(
      new Error('Optimization failed')
    )

    // Act
    const result = await optimizePaymentData()

    // Assert
    expect(result).toBe(false)
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('getDailyBalanceStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должна получать дневную статистику', async () => {
    // Arrange
    const mockDailyStats = [
      {
        bot_name: 'test_bot',
        date: '2025-08-24',
        unique_users: 50,
        total_transactions: 200,
        daily_income: 5000,
        daily_outcome: 3000,
        daily_cost: 500,
        daily_bonuses: 100,
      },
      {
        bot_name: 'test_bot',
        date: '2025-08-23',
        unique_users: 45,
        total_transactions: 180,
        daily_income: 4500,
        daily_outcome: 2800,
        daily_cost: 400,
        daily_bonuses: 80,
      },
    ]

    const fromMock = vi.fn().mockReturnThis()
    const selectMock = vi.fn().mockReturnThis()
    const eqMock = vi.fn().mockReturnThis()
    const orderMock = vi.fn().mockReturnThis()
    const gteMock = vi.fn().mockReturnThis()
    const lteMock = vi.fn().mockReturnThis()

    vi.mocked(supabase.from).mockReturnValue({
      select: selectMock,
      eq: eqMock,
      order: orderMock,
      gte: gteMock,
      lte: lteMock,
      data: mockDailyStats,
      error: null,
    } as any)

    selectMock.mockReturnValue({
      eq: eqMock,
      order: orderMock,
      gte: gteMock,
      lte: lteMock,
      data: mockDailyStats,
      error: null,
    } as any)

    eqMock.mockReturnValue({
      order: orderMock,
      gte: gteMock,
      lte: lteMock,
      data: mockDailyStats,
      error: null,
    } as any)

    orderMock.mockReturnValue({
      gte: gteMock,
      lte: lteMock,
      data: mockDailyStats,
      error: null,
    } as any)

    // Act
    const result = await getDailyBalanceStats('test_bot')

    // Assert
    expect(result).toEqual(mockDailyStats)
    expect(supabase.from).toHaveBeenCalledWith('daily_balance_stats')
  })

  it('должна фильтровать по датам', async () => {
    // Arrange
    const startDate = new Date('2025-08-20')
    const endDate = new Date('2025-08-24')

    const fromMock = vi.fn().mockReturnThis()
    const selectMock = vi.fn().mockReturnThis()
    const eqMock = vi.fn().mockReturnThis()
    const orderMock = vi.fn().mockReturnThis()
    const gteMock = vi.fn().mockReturnThis()
    const lteMock = vi.fn().mockReturnThis()

    vi.mocked(supabase.from).mockReturnValue({
      select: selectMock,
      eq: eqMock,
      order: orderMock,
      gte: gteMock,
      lte: lteMock,
    } as any)

    selectMock.mockReturnValue({
      eq: eqMock,
      order: orderMock,
      gte: gteMock,
      lte: lteMock,
    } as any)

    eqMock.mockReturnValue({
      order: orderMock,
      gte: gteMock,
      lte: lteMock,
    } as any)

    orderMock.mockReturnValue({
      gte: gteMock,
      lte: lteMock,
    } as any)

    gteMock.mockReturnValue({
      lte: lteMock,
    } as any)

    lteMock.mockResolvedValue({
      data: [],
      error: null,
    })

    // Act
    await getDailyBalanceStats('test_bot', startDate, endDate)

    // Assert
    expect(gteMock).toHaveBeenCalledWith('date', '2025-08-20')
    expect(lteMock).toHaveBeenCalledWith('date', '2025-08-24')
  })

  it('должна обрабатывать ошибки БД', async () => {
    // Arrange
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: new Error('Database error'),
      }),
    } as any)

    // Act
    const result = await getDailyBalanceStats('test_bot')

    // Assert
    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('Интеграционные тесты', () => {
  it('должна корректно работать с большими объемами данных', async () => {
    // Arrange
    const largeServiceBreakdown = Array.from({ length: 100 }, (_, i) => ({
      service: `service_${i}`,
      count: Math.floor(Math.random() * 100),
      total_stars: Math.floor(Math.random() * 1000),
      avg_stars: Math.floor(Math.random() * 50),
      percentage: Math.random() * 100,
      last_used: new Date().toISOString(),
    }))

    const largeStats: OptimizedBalanceStats = {
      current_balance: 999999,
      total_real_income: 500000,
      total_bonus_income: 500000,
      total_outcome: 1,
      total_transactions: 10000,
      payment_methods: {
        rubles: { stars: 250000, amount: 500000, count: 500 },
        telegram_stars: { stars: 250000, count: 500 },
      },
      services_breakdown: largeServiceBreakdown.slice(0, 10), // Функция должна ограничивать
      recent_topups: Array.from({ length: 5 }, () => ({
        date: new Date().toISOString(),
        stars: 1000,
        amount: 2000,
        currency: 'RUB',
        payment_method: 'Robokassa',
        description: 'Top up',
      })),
      recent_expenses: Array.from({ length: 5 }, () => ({
        date: new Date().toISOString(),
        stars: 50,
        service: 'test_service',
        description: 'Test expense',
      })),
    }

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: largeStats,
      error: null,
    } as any)

    // Act
    const result = await getUserBalanceStatsOptimized('biguser')

    // Assert
    expect(result).toEqual(largeStats)
    expect(result?.services_breakdown.length).toBeLessThanOrEqual(10)
    expect(result?.recent_topups.length).toBeLessThanOrEqual(5)
    expect(result?.recent_expenses.length).toBeLessThanOrEqual(5)
  })

  it('должна корректно округлять дробные значения', async () => {
    // Arrange
    const statsWithDecimals: OptimizedBalanceStats = {
      current_balance: 123.456789,
      total_real_income: 100.111111,
      total_bonus_income: 50.999999,
      total_outcome: 27.654321,
      total_transactions: 10,
      payment_methods: {
        rubles: {
          stars: 100.111111,
          amount: 230.456789,
          count: 1,
        },
        telegram_stars: {
          stars: 0,
          count: 0,
        },
      },
      services_breakdown: [
        {
          service: 'test',
          count: 1,
          total_stars: 27.65,
          avg_stars: 27.65,
          percentage: 100.0,
          last_used: '2025-08-24',
        },
      ],
      recent_topups: [],
      recent_expenses: [],
    }

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: statsWithDecimals,
      error: null,
    } as any)

    // Act
    const result = await getUserBalanceStatsOptimized('123')

    // Assert
    expect(result?.current_balance).toBe(123.456789)
    expect(result?.services_breakdown[0].total_stars).toBe(27.65)
    expect(result?.services_breakdown[0].percentage).toBe(100.0)
  })
})
