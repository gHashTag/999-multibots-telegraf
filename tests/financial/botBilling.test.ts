/**
 * FINANCIAL TESTING SUITE - Bot Billing & HaimGroupMedia_bot Validation
 * Tests for validating bot-specific billing calculations and HaimGroupMedia_bot corrections
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals'

// Mock interfaces matching the actual system
interface BotStatistics {
  bot_name: string
  neurovideo_income: number
  stars_topup_income: number
  total_income: number
  total_outcome: number
  total_cost: number
  net_profit: number
}

interface MockPaymentRecord {
  telegram_id: number
  payment_date: string
  amount: number
  stars: number
  currency: string
  status: string
  type: 'MONEY_INCOME' | 'MONEY_OUTCOME' | 'BONUS'
  service_type: string | null
  bot_name: string
  payment_method: string | null
  category: 'REAL' | 'BONUS'
  cost: number | null
  subscription_type: string | null
}

describe('Bot Billing Calculations', () => {
  let mockPayments: MockPaymentRecord[]

  beforeEach(() => {
    mockPayments = [
      // NeuroPhotoBot payments
      {
        telegram_id: 111111111,
        payment_date: '2024-01-15T10:00:00Z',
        amount: 1000,
        stars: 434,
        currency: 'RUB',
        status: 'COMPLETED',
        type: 'MONEY_INCOME',
        service_type: null,
        bot_name: 'NeuroPhotoBot',
        payment_method: 'Robokassa',
        category: 'REAL',
        cost: null,
        subscription_type: null
      },
      {
        telegram_id: 111111111,
        payment_date: '2024-01-15T12:00:00Z',
        amount: 0,
        stars: 20,
        currency: 'XTR',
        status: 'COMPLETED',
        type: 'MONEY_OUTCOME',
        service_type: 'neuro_photo',
        bot_name: 'NeuroPhotoBot',
        payment_method: null,
        category: 'REAL',
        cost: 4,
        subscription_type: null
      },
      // HaimGroupMedia_bot payments
      {
        telegram_id: 222222222,
        payment_date: '2024-01-16T14:00:00Z',
        amount: 2999,
        stars: 1303,
        currency: 'RUB',
        status: 'COMPLETED',
        type: 'MONEY_INCOME',
        service_type: null,
        bot_name: 'HaimGroupMedia_bot',
        payment_method: 'Robokassa',
        category: 'REAL',
        cost: null,
        subscription_type: 'NEUROVIDEO'
      },
      {
        telegram_id: 222222222,
        payment_date: '2024-01-16T15:00:00Z',
        amount: 0,
        stars: 74,
        currency: 'XTR',
        status: 'COMPLETED',
        type: 'MONEY_OUTCOME',
        service_type: 'kling_video',
        bot_name: 'HaimGroupMedia_bot',
        payment_method: null,
        category: 'REAL',
        cost: 10,
        subscription_type: null
      }
    ]
  })

  describe('Bot Statistics Calculation', () => {
    test('should calculate total income correctly per bot', () => {
      const botStats = calculateBotStatistics(mockPayments)

      const neuroPhotoBot = botStats.find(bot => bot.bot_name === 'NeuroPhotoBot')
      const haimGroupBot = botStats.find(bot => bot.bot_name === 'HaimGroupMedia_bot')

      expect(neuroPhotoBot?.total_income).toBe(434)
      expect(haimGroupBot?.total_income).toBe(1303)
    })

    test('should calculate total outcome correctly per bot', () => {
      const botStats = calculateBotStatistics(mockPayments)

      const neuroPhotoBot = botStats.find(bot => bot.bot_name === 'NeuroPhotoBot')
      const haimGroupBot = botStats.find(bot => bot.bot_name === 'HaimGroupMedia_bot')

      expect(neuroPhotoBot?.total_outcome).toBe(20)
      expect(haimGroupBot?.total_outcome).toBe(74)
    })

    test('should calculate total cost correctly per bot', () => {
      const botStats = calculateBotStatistics(mockPayments)

      const neuroPhotoBot = botStats.find(bot => bot.bot_name === 'NeuroPhotoBot')
      const haimGroupBot = botStats.find(bot => bot.bot_name === 'HaimGroupMedia_bot')

      expect(neuroPhotoBot?.total_cost).toBe(4)
      expect(haimGroupBot?.total_cost).toBe(10)
    })

    test('should calculate net profit correctly per bot', () => {
      const botStats = calculateBotStatistics(mockPayments)

      const neuroPhotoBot = botStats.find(bot => bot.bot_name === 'NeuroPhotoBot')
      const haimGroupBot = botStats.find(bot => bot.bot_name === 'HaimGroupMedia_bot')

      // Net profit = income - outcome - cost
      expect(neuroPhotoBot?.net_profit).toBe(410) // 434 - 20 - 4
      expect(haimGroupBot?.net_profit).toBe(1219) // 1303 - 74 - 10
    })

    test('should separate neurovideo income from stars topup income', () => {
      const botStats = calculateBotStatistics(mockPayments)

      const haimGroupBot = botStats.find(bot => bot.bot_name === 'HaimGroupMedia_bot')

      // NEUROVIDEO subscription income
      expect(haimGroupBot?.neurovideo_income).toBe(1303)
      // Regular stars topup income (should be 0 in this test data)
      expect(haimGroupBot?.stars_topup_income).toBe(0)
    })
  })

  describe('HaimGroupMedia_bot Name Correction', () => {
    test('should correctly identify HaimGroupMedia_bot payments', () => {
      const haimPayments = mockPayments.filter(p => p.bot_name === 'HaimGroupMedia_bot')

      expect(haimPayments).toHaveLength(2)
      expect(haimPayments[0].subscription_type).toBe('NEUROVIDEO')
      expect(haimPayments[1].service_type).toBe('kling_video')
    })

    test('should handle HaimGroupMedia_bot name variations', () => {
      const nameVariations = [
        'HaimGroupMedia_bot',
        'haimgroupmedia_bot',
        'HAIMGROUPMEDIA_BOT',
        'HaimGroupMediaBot'
      ]

      const normalizeHaimBotName = (botName: string): string => {
        const normalized = botName.toLowerCase().replace(/[^a-z0-9]/g, '')
        if (normalized.includes('haimgroupmedia')) {
          return 'HaimGroupMedia_bot'
        }
        return botName
      }

      nameVariations.forEach(variation => {
        const normalized = normalizeHaimBotName(variation)
        expect(normalized).toBe('HaimGroupMedia_bot')
      })
    })

    test('should preserve other bot names unchanged', () => {
      const otherBotNames = [
        'NeuroPhotoBot',
        'NeuroVideoBot',
        'TestBot',
        'AnotherBot'
      ]

      const normalizeHaimBotName = (botName: string): string => {
        const normalized = botName.toLowerCase().replace(/[^a-z0-9]/g, '')
        if (normalized.includes('haimgroupmedia')) {
          return 'HaimGroupMedia_bot'
        }
        return botName
      }

      otherBotNames.forEach(botName => {
        const normalized = normalizeHaimBotName(botName)
        expect(normalized).toBe(botName)
      })
    })
  })

  describe('Monthly Aggregation Accuracy', () => {
    test('should aggregate payments by month correctly', () => {
      const monthlyData = aggregatePaymentsByMonth(mockPayments)

      expect(monthlyData['2024-01']).toBeDefined()
      expect(monthlyData['2024-01'].total_income).toBe(1737) // 434 + 1303
      expect(monthlyData['2024-01'].total_outcome).toBe(94) // 20 + 74
      expect(monthlyData['2024-01'].total_cost).toBe(14) // 4 + 10
    })

    test('should handle multiple months correctly', () => {
      const paymentsMultipleMonths = [
        ...mockPayments,
        {
          telegram_id: 333333333,
          payment_date: '2024-02-01T10:00:00Z',
          amount: 500,
          stars: 217,
          currency: 'RUB',
          status: 'COMPLETED',
          type: 'MONEY_INCOME' as const,
          service_type: null,
          bot_name: 'NeuroPhotoBot',
          payment_method: 'Robokassa',
          category: 'REAL' as const,
          cost: null,
          subscription_type: null
        }
      ]

      const monthlyData = aggregatePaymentsByMonth(paymentsMultipleMonths)

      expect(monthlyData['2024-01']).toBeDefined()
      expect(monthlyData['2024-02']).toBeDefined()
      expect(monthlyData['2024-02'].total_income).toBe(217)
    })

    test('should calculate monthly profit margins correctly', () => {
      const monthlyData = aggregatePaymentsByMonth(mockPayments)
      const january = monthlyData['2024-01']

      const profitMargin = january.total_income > 0
        ? ((january.total_income - january.total_outcome - january.total_cost) / january.total_income) * 100
        : 0

      expect(profitMargin).toBeCloseTo(94.38, 2) // (1737 - 94 - 14) / 1737 * 100
    })
  })

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty payment arrays', () => {
      const botStats = calculateBotStatistics([])
      expect(botStats).toEqual([])
    })

    test('should handle payments with null values', () => {
      const paymentsWithNulls: MockPaymentRecord[] = [
        {
          telegram_id: 444444444,
          payment_date: '2024-01-01T00:00:00Z',
          amount: 0,
          stars: 0,
          currency: 'XTR',
          status: 'COMPLETED',
          type: 'MONEY_OUTCOME',
          service_type: null,
          bot_name: 'TestBot',
          payment_method: null,
          category: 'REAL',
          cost: null,
          subscription_type: null
        }
      ]

      const botStats = calculateBotStatistics(paymentsWithNulls)
      const testBot = botStats.find(bot => bot.bot_name === 'TestBot')

      expect(testBot?.total_cost).toBe(0) // null cost should be treated as 0
      expect(testBot?.total_outcome).toBe(0)
      expect(testBot?.total_income).toBe(0)
    })

    test('should handle invalid dates gracefully', () => {
      const paymentsWithInvalidDate: MockPaymentRecord[] = [
        {
          telegram_id: 555555555,
          payment_date: 'invalid-date',
          amount: 100,
          stars: 43,
          currency: 'RUB',
          status: 'COMPLETED',
          type: 'MONEY_INCOME',
          service_type: null,
          bot_name: 'TestBot',
          payment_method: 'Robokassa',
          category: 'REAL',
          cost: null,
          subscription_type: null
        }
      ]

      const monthlyData = aggregatePaymentsByMonth(paymentsWithInvalidDate)

      // Should handle invalid dates without crashing
      expect(typeof monthlyData).toBe('object')
    })

    test('should handle extremely large numbers', () => {
      const paymentsLargeNumbers: MockPaymentRecord[] = [
        {
          telegram_id: 666666666,
          payment_date: '2024-01-01T00:00:00Z',
          amount: Number.MAX_SAFE_INTEGER,
          stars: 999999999,
          currency: 'RUB',
          status: 'COMPLETED',
          type: 'MONEY_INCOME',
          service_type: null,
          bot_name: 'TestBot',
          payment_method: 'Robokassa',
          category: 'REAL',
          cost: 999999,
          subscription_type: null
        }
      ]

      const botStats = calculateBotStatistics(paymentsLargeNumbers)
      const testBot = botStats.find(bot => bot.bot_name === 'TestBot')

      expect(testBot?.total_income).toBe(999999999)
      expect(testBot?.total_cost).toBe(999999)
      expect(Number.isFinite(testBot?.net_profit)).toBe(true)
    })
  })

  describe('Performance Tests for Large Datasets', () => {
    test('should process large bot billing datasets efficiently', () => {
      // Generate large dataset
      const largeBotDataset: MockPaymentRecord[] = []
      const botNames = ['Bot1', 'Bot2', 'Bot3', 'HaimGroupMedia_bot', 'Bot5']

      for (let i = 0; i < 50000; i++) {
        largeBotDataset.push({
          telegram_id: Math.floor(Math.random() * 1000000),
          payment_date: `2024-01-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}T10:00:00Z`,
          amount: Math.random() * 5000,
          stars: Math.random() * 2000,
          currency: Math.random() > 0.5 ? 'RUB' : 'XTR',
          status: 'COMPLETED',
          type: Math.random() > 0.7 ? 'MONEY_INCOME' : 'MONEY_OUTCOME',
          service_type: Math.random() > 0.5 ? 'neuro_photo' : null,
          bot_name: botNames[Math.floor(Math.random() * botNames.length)],
          payment_method: Math.random() > 0.5 ? 'Robokassa' : 'Telegram',
          category: 'REAL',
          cost: Math.random() > 0.5 ? Math.random() * 50 : null,
          subscription_type: Math.random() > 0.8 ? 'NEUROVIDEO' : null
        })
      }

      const startTime = performance.now()
      const botStats = calculateBotStatistics(largeBotDataset)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(5000) // Should complete in under 5 seconds
      expect(botStats.length).toBeGreaterThan(0)
      expect(botStats.length).toBeLessThanOrEqual(5) // Should not exceed number of unique bots

      // Verify HaimGroupMedia_bot is processed correctly
      const haimBot = botStats.find(bot => bot.bot_name === 'HaimGroupMedia_bot')
      if (haimBot) {
        expect(haimBot.total_income).toBeGreaterThanOrEqual(0)
        expect(haimBot.total_outcome).toBeGreaterThanOrEqual(0)
        expect(haimBot.total_cost).toBeGreaterThanOrEqual(0)
      }
    })
  })
})

// Helper functions for testing
function calculateBotStatistics(payments: MockPaymentRecord[]): BotStatistics[] {
  const botMap = new Map<string, BotStatistics>()

  payments.forEach(payment => {
    if (!botMap.has(payment.bot_name)) {
      botMap.set(payment.bot_name, {
        bot_name: payment.bot_name,
        neurovideo_income: 0,
        stars_topup_income: 0,
        total_income: 0,
        total_outcome: 0,
        total_cost: 0,
        net_profit: 0
      })
    }

    const botStats = botMap.get(payment.bot_name)!

    if (payment.type === 'MONEY_INCOME') {
      botStats.total_income += payment.stars

      if (payment.subscription_type === 'NEUROVIDEO') {
        botStats.neurovideo_income += payment.stars
      } else {
        botStats.stars_topup_income += payment.stars
      }
    } else if (payment.type === 'MONEY_OUTCOME') {
      botStats.total_outcome += payment.stars
      botStats.total_cost += payment.cost || 0
    }

    botStats.net_profit = botStats.total_income - botStats.total_outcome - botStats.total_cost
  })

  return Array.from(botMap.values())
}

function aggregatePaymentsByMonth(payments: MockPaymentRecord[]): Record<string, any> {
  const monthlyMap = new Map<string, any>()

  payments.forEach(payment => {
    const date = new Date(payment.payment_date)
    if (isNaN(date.getTime())) return // Skip invalid dates

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        total_income: 0,
        total_outcome: 0,
        total_cost: 0,
        net_profit: 0
      })
    }

    const monthStats = monthlyMap.get(monthKey)!

    if (payment.type === 'MONEY_INCOME') {
      monthStats.total_income += payment.stars
    } else if (payment.type === 'MONEY_OUTCOME') {
      monthStats.total_outcome += payment.stars
      monthStats.total_cost += payment.cost || 0
    }

    monthStats.net_profit = monthStats.total_income - monthStats.total_outcome - monthStats.total_cost
  })

  return Object.fromEntries(monthlyMap)
}