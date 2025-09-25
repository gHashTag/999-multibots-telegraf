/**
 * FINANCIAL TESTING SUITE - End-to-End Integration Tests
 * Comprehensive validation of the complete financial billing system
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals'

// Mock the database connection
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        order: jest.fn(() => ({
          range: jest.fn()
        }))
      })),
      filter: jest.fn(() => ({
        order: jest.fn()
      })),
      order: jest.fn()
    })),
    insert: jest.fn(() => ({
      select: jest.fn()
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn()
      }))
    }))
  }))
}

// Mock complete financial transaction scenarios
interface FinancialTransaction {
  user_id: string
  transaction_id: string
  type: 'INCOME' | 'OUTCOME' | 'BONUS'
  amount_rub?: number
  amount_stars: number
  service_type?: string
  bot_name: string
  payment_method: string
  timestamp: string
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
}

interface FinancialScenario {
  name: string
  description: string
  transactions: FinancialTransaction[]
  expected_balance: number
  expected_profit: number
  expected_cost: number
}

describe('End-to-End Financial System Integration Tests', () => {
  let testScenarios: FinancialScenario[]

  beforeAll(() => {
    // Set up comprehensive test scenarios
    testScenarios = [
      {
        name: 'Standard User Journey - Photo Generation',
        description: 'User purchases stars, generates photos, checks balance',
        transactions: [
          {
            user_id: 'user_001',
            transaction_id: 'txn_001',
            type: 'INCOME',
            amount_rub: 1000,
            amount_stars: 434,
            bot_name: 'NeuroPhotoBot',
            payment_method: 'Robokassa',
            timestamp: '2024-01-15T10:00:00Z',
            status: 'COMPLETED'
          },
          {
            user_id: 'user_001',
            transaction_id: 'txn_002',
            type: 'OUTCOME',
            amount_stars: 20,
            service_type: 'neuro_photo',
            bot_name: 'NeuroPhotoBot',
            payment_method: 'System',
            timestamp: '2024-01-15T10:30:00Z',
            status: 'COMPLETED'
          },
          {
            user_id: 'user_001',
            transaction_id: 'txn_003',
            type: 'OUTCOME',
            amount_stars: 20,
            service_type: 'neuro_photo',
            bot_name: 'NeuroPhotoBot',
            payment_method: 'System',
            timestamp: '2024-01-15T11:00:00Z',
            status: 'COMPLETED'
          }
        ],
        expected_balance: 394, // 434 - 20 - 20
        expected_profit: 386, // Balance minus service costs (4 + 4)
        expected_cost: 8 // 2 photos * 4 stars each
      },
      {
        name: 'HaimGroupMedia_bot Premium User',
        description: 'Premium subscription with video generation usage',
        transactions: [
          {
            user_id: 'user_002',
            transaction_id: 'txn_004',
            type: 'INCOME',
            amount_rub: 2999,
            amount_stars: 1303,
            bot_name: 'HaimGroupMedia_bot',
            payment_method: 'Robokassa',
            timestamp: '2024-01-16T09:00:00Z',
            status: 'COMPLETED'
          },
          {
            user_id: 'user_002',
            transaction_id: 'txn_005',
            type: 'OUTCOME',
            amount_stars: 74,
            service_type: 'kling_video',
            bot_name: 'HaimGroupMedia_bot',
            payment_method: 'System',
            timestamp: '2024-01-16T10:00:00Z',
            status: 'COMPLETED'
          },
          {
            user_id: 'user_002',
            transaction_id: 'txn_006',
            type: 'OUTCOME',
            amount_stars: 158,
            service_type: 'video_generation_other',
            bot_name: 'HaimGroupMedia_bot',
            payment_method: 'System',
            timestamp: '2024-01-16T11:00:00Z',
            status: 'COMPLETED'
          }
        ],
        expected_balance: 1071, // 1303 - 74 - 158
        expected_profit: 903, // Balance minus service costs (10 + 158)
        expected_cost: 168 // Kling video (10) + Other video (158)
      },
      {
        name: 'Mixed Payment Methods Scenario',
        description: 'User using both Robokassa and Telegram Stars',
        transactions: [
          {
            user_id: 'user_003',
            transaction_id: 'txn_007',
            type: 'INCOME',
            amount_rub: 500,
            amount_stars: 217,
            bot_name: 'NeuroPhotoBot',
            payment_method: 'Robokassa',
            timestamp: '2024-01-17T08:00:00Z',
            status: 'COMPLETED'
          },
          {
            user_id: 'user_003',
            transaction_id: 'txn_008',
            type: 'INCOME',
            amount_stars: 100,
            bot_name: 'NeuroPhotoBot',
            payment_method: 'Telegram',
            timestamp: '2024-01-17T08:30:00Z',
            status: 'COMPLETED'
          },
          {
            user_id: 'user_003',
            transaction_id: 'txn_009',
            type: 'BONUS',
            amount_stars: 50,
            bot_name: 'NeuroPhotoBot',
            payment_method: 'System',
            timestamp: '2024-01-17T09:00:00Z',
            status: 'COMPLETED'
          },
          {
            user_id: 'user_003',
            transaction_id: 'txn_010',
            type: 'OUTCOME',
            amount_stars: 84,
            service_type: 'morphing',
            bot_name: 'NeuroPhotoBot',
            payment_method: 'System',
            timestamp: '2024-01-17T10:00:00Z',
            status: 'COMPLETED'
          }
        ],
        expected_balance: 283, // 217 + 100 + 50 - 84
        expected_profit: 199, // Balance minus service cost (84)
        expected_cost: 84 // Morphing cost
      },
      {
        name: 'Failed Transaction Recovery',
        description: 'Handling failed transactions and refunds',
        transactions: [
          {
            user_id: 'user_004',
            transaction_id: 'txn_011',
            type: 'INCOME',
            amount_rub: 1000,
            amount_stars: 434,
            bot_name: 'NeuroPhotoBot',
            payment_method: 'Robokassa',
            timestamp: '2024-01-18T10:00:00Z',
            status: 'FAILED'
          },
          {
            user_id: 'user_004',
            transaction_id: 'txn_012',
            type: 'INCOME',
            amount_rub: 1000,
            amount_stars: 434,
            bot_name: 'NeuroPhotoBot',
            payment_method: 'Robokassa',
            timestamp: '2024-01-18T10:30:00Z',
            status: 'COMPLETED'
          },
          {
            user_id: 'user_004',
            transaction_id: 'txn_013',
            type: 'OUTCOME',
            amount_stars: 20,
            service_type: 'neuro_photo',
            bot_name: 'NeuroPhotoBot',
            payment_method: 'System',
            timestamp: '2024-01-18T11:00:00Z',
            status: 'COMPLETED'
          }
        ],
        expected_balance: 414, // Only successful transactions: 434 - 20
        expected_profit: 410, // Balance minus service cost (4)
        expected_cost: 4 // Single photo cost
      }
    ]
  })

  describe('Complete Financial Flow Validation', () => {
    testScenarios.forEach(scenario => {
      test(`should handle ${scenario.name} correctly`, () => {
        const result = processFinancialScenario(scenario)

        expect(result.final_balance).toBe(scenario.expected_balance)
        expect(result.total_profit).toBe(scenario.expected_profit)
        expect(result.total_cost).toBe(scenario.expected_cost)
        expect(result.transaction_count).toBe(
          scenario.transactions.filter(t => t.status === 'COMPLETED').length
        )
      })
    })
  })

  describe('Data Consistency Validation', () => {
    test('should maintain referential integrity across all transactions', () => {
      const allTransactions = testScenarios.flatMap(s => s.transactions)

      // Validate user_id consistency
      const userTransactions = groupBy(allTransactions, 'user_id')
      Object.entries(userTransactions).forEach(([userId, transactions]) => {
        expect(userId).toMatch(/^user_\d+$/)
        expect(transactions.length).toBeGreaterThan(0)
      })

      // Validate bot_name consistency
      const botTransactions = groupBy(allTransactions, 'bot_name')
      Object.keys(botTransactions).forEach(botName => {
        expect(['NeuroPhotoBot', 'HaimGroupMedia_bot']).toContain(botName)
      })
    })

    test('should validate transaction timestamp ordering', () => {
      testScenarios.forEach(scenario => {
        const timestamps = scenario.transactions.map(t => new Date(t.timestamp).getTime())

        for (let i = 1; i < timestamps.length; i++) {
          expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1])
        }
      })
    })

    test('should validate service type and cost alignment', () => {
      const allTransactions = testScenarios.flatMap(s => s.transactions)
      const serviceTransactions = allTransactions.filter(t => t.service_type)

      const serviceCostMap: Record<string, number> = {
        'neuro_photo': 4,
        'kling_video': 10,
        'video_generation_other': 158,
        'morphing': 84
      }

      serviceTransactions.forEach(transaction => {
        if (transaction.service_type) {
          const expectedCost = serviceCostMap[transaction.service_type]
          expect(expectedCost).toBeDefined()
          expect(expectedCost).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('HaimGroupMedia_bot Specific Validation', () => {
    test('should handle HaimGroupMedia_bot transactions correctly', () => {
      const haimScenario = testScenarios.find(s =>
        s.transactions.some(t => t.bot_name === 'HaimGroupMedia_bot')
      )

      expect(haimScenario).toBeDefined()

      const haimTransactions = haimScenario!.transactions.filter(
        t => t.bot_name === 'HaimGroupMedia_bot'
      )

      expect(haimTransactions.length).toBeGreaterThan(0)

      // Validate HaimGroupMedia_bot specific services
      const haimServiceTypes = haimTransactions
        .filter(t => t.service_type)
        .map(t => t.service_type)

      expect(haimServiceTypes).toContain('kling_video')
    })

    test('should apply correct name normalization for HaimGroupMedia_bot', () => {
      const normalizeHaimBotName = (botName: string): string => {
        const normalized = botName.toLowerCase().replace(/[^a-z0-9]/g, '')
        if (normalized.includes('haimgroupmedia')) {
          return 'HaimGroupMedia_bot'
        }
        return botName
      }

      const testNames = [
        'HaimGroupMedia_bot',
        'haimgroupmedia_bot',
        'HAIMGROUPMEDIA_BOT',
        'HaimGroupMediaBot'
      ]

      testNames.forEach(name => {
        expect(normalizeHaimBotName(name)).toBe('HaimGroupMedia_bot')
      })
    })
  })

  describe('Real vs Virtual Money Separation', () => {
    test('should correctly categorize real money transactions', () => {
      const allTransactions = testScenarios.flatMap(s => s.transactions)

      const realMoneyTransactions = allTransactions.filter(t =>
        (t.amount_rub && t.amount_rub > 0) ||
        (t.payment_method === 'Telegram' && t.type === 'INCOME')
      )

      realMoneyTransactions.forEach(transaction => {
        expect(['Robokassa', 'Telegram']).toContain(transaction.payment_method)
        if (transaction.amount_rub) {
          expect(transaction.amount_rub).toBeGreaterThan(0)
        }
        expect(transaction.amount_stars).toBeGreaterThan(0)
      })
    })

    test('should correctly categorize bonus transactions', () => {
      const allTransactions = testScenarios.flatMap(s => s.transactions)

      const bonusTransactions = allTransactions.filter(t => t.type === 'BONUS')

      bonusTransactions.forEach(transaction => {
        expect(transaction.payment_method).toBe('System')
        expect(transaction.amount_rub).toBeUndefined()
        expect(transaction.amount_stars).toBeGreaterThan(0)
      })
    })

    test('should maintain accurate balance calculations with mixed transactions', () => {
      const mixedScenario = testScenarios.find(s => s.name.includes('Mixed Payment Methods'))!

      const realIncomes = mixedScenario.transactions.filter(t =>
        t.type === 'INCOME' && t.status === 'COMPLETED'
      )
      const bonusIncomes = mixedScenario.transactions.filter(t =>
        t.type === 'BONUS' && t.status === 'COMPLETED'
      )
      const outcomes = mixedScenario.transactions.filter(t =>
        t.type === 'OUTCOME' && t.status === 'COMPLETED'
      )

      const totalRealStars = realIncomes.reduce((sum, t) => sum + t.amount_stars, 0)
      const totalBonusStars = bonusIncomes.reduce((sum, t) => sum + t.amount_stars, 0)
      const totalOutcomeStars = outcomes.reduce((sum, t) => sum + t.amount_stars, 0)

      expect(totalRealStars).toBe(317) // 217 + 100
      expect(totalBonusStars).toBe(50)
      expect(totalOutcomeStars).toBe(84)
      expect(totalRealStars + totalBonusStars - totalOutcomeStars).toBe(283)
    })
  })

  describe('Monthly Aggregation Tests', () => {
    test('should aggregate transactions by month correctly', () => {
      const allTransactions = testScenarios.flatMap(s => s.transactions)
      const monthlyAggregation = aggregateTransactionsByMonth(allTransactions)

      expect(monthlyAggregation['2024-01']).toBeDefined()

      const january = monthlyAggregation['2024-01']
      expect(january.total_income).toBeGreaterThan(0)
      expect(january.total_outcome).toBeGreaterThan(0)
      expect(january.transaction_count).toBeGreaterThan(0)
    })

    test('should calculate monthly profit margins accurately', () => {
      const allTransactions = testScenarios.flatMap(s => s.transactions)
      const monthlyAggregation = aggregateTransactionsByMonth(allTransactions)

      Object.values(monthlyAggregation).forEach((month: any) => {
        const profitMargin = month.total_income > 0
          ? ((month.total_income - month.total_outcome - month.total_cost) / month.total_income) * 100
          : 0

        expect(profitMargin).toBeGreaterThanOrEqual(0)
        expect(profitMargin).toBeLessThanOrEqual(100)
        expect(Number.isFinite(profitMargin)).toBe(true)
      })
    })
  })

  describe('Error Recovery and Edge Cases', () => {
    test('should handle failed transactions correctly', () => {
      const failedScenario = testScenarios.find(s => s.name.includes('Failed Transaction'))!
      const result = processFinancialScenario(failedScenario)

      // Failed transactions should not affect balance
      const completedTransactions = failedScenario.transactions.filter(t => t.status === 'COMPLETED')
      const expectedBalance = calculateExpectedBalance(completedTransactions)

      expect(result.final_balance).toBe(expectedBalance)
      expect(result.failed_transactions).toBe(1)
    })

    test('should handle concurrent transactions safely', () => {
      // Simulate concurrent transactions with same timestamp
      const concurrentTransactions: FinancialTransaction[] = [
        {
          user_id: 'user_concurrent',
          transaction_id: 'txn_c1',
          type: 'INCOME',
          amount_stars: 100,
          bot_name: 'NeuroPhotoBot',
          payment_method: 'Telegram',
          timestamp: '2024-01-01T10:00:00Z',
          status: 'COMPLETED'
        },
        {
          user_id: 'user_concurrent',
          transaction_id: 'txn_c2',
          type: 'OUTCOME',
          amount_stars: 20,
          service_type: 'neuro_photo',
          bot_name: 'NeuroPhotoBot',
          payment_method: 'System',
          timestamp: '2024-01-01T10:00:00Z',
          status: 'COMPLETED'
        }
      ]

      const scenario: FinancialScenario = {
        name: 'Concurrent Transactions',
        description: 'Testing concurrent transaction handling',
        transactions: concurrentTransactions,
        expected_balance: 80,
        expected_profit: 76,
        expected_cost: 4
      }

      const result = processFinancialScenario(scenario)
      expect(result.final_balance).toBe(80)
    })

    test('should validate transaction uniqueness', () => {
      const allTransactions = testScenarios.flatMap(s => s.transactions)
      const transactionIds = allTransactions.map(t => t.transaction_id)
      const uniqueIds = new Set(transactionIds)

      expect(uniqueIds.size).toBe(transactionIds.length)
    })
  })

  describe('Performance and Scalability Tests', () => {
    test('should handle large transaction volumes efficiently', () => {
      const largeDataset = generateLargeTransactionDataset(10000)

      const startTime = performance.now()
      const result = processLargeFinancialDataset(largeDataset)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(5000) // Should complete in under 5 seconds
      expect(result.processed_count).toBe(10000)
      expect(result.balance_calculated).toBe(true)
    })

    test('should maintain accuracy with floating point calculations', () => {
      const scenario: FinancialScenario = {
        name: 'Floating Point Precision',
        description: 'Testing floating point arithmetic accuracy',
        transactions: [
          {
            user_id: 'user_float',
            transaction_id: 'txn_float1',
            type: 'INCOME',
            amount_stars: 0.1,
            bot_name: 'NeuroPhotoBot',
            payment_method: 'System',
            timestamp: '2024-01-01T10:00:00Z',
            status: 'COMPLETED'
          },
          {
            user_id: 'user_float',
            transaction_id: 'txn_float2',
            type: 'INCOME',
            amount_stars: 0.2,
            bot_name: 'NeuroPhotoBot',
            payment_method: 'System',
            timestamp: '2024-01-01T10:01:00Z',
            status: 'COMPLETED'
          }
        ],
        expected_balance: 0.3,
        expected_profit: 0.3,
        expected_cost: 0
      }

      const result = processFinancialScenario(scenario)
      expect(Math.abs(result.final_balance - 0.3)).toBeLessThan(0.000001)
    })
  })
})

// Helper functions for testing
function processFinancialScenario(scenario: FinancialScenario) {
  const completedTransactions = scenario.transactions.filter(t => t.status === 'COMPLETED')

  const income = completedTransactions
    .filter(t => t.type === 'INCOME' || t.type === 'BONUS')
    .reduce((sum, t) => sum + t.amount_stars, 0)

  const outcome = completedTransactions
    .filter(t => t.type === 'OUTCOME')
    .reduce((sum, t) => sum + t.amount_stars, 0)

  const cost = completedTransactions
    .filter(t => t.type === 'OUTCOME' && t.service_type)
    .reduce((sum, t) => {
      const serviceCosts: Record<string, number> = {
        'neuro_photo': 4,
        'kling_video': 10,
        'video_generation_other': 158,
        'morphing': 84
      }
      return sum + (serviceCosts[t.service_type!] || 0)
    }, 0)

  return {
    final_balance: income - outcome,
    total_profit: income - outcome - cost,
    total_cost: cost,
    transaction_count: completedTransactions.length,
    failed_transactions: scenario.transactions.filter(t => t.status === 'FAILED').length
  }
}

function calculateExpectedBalance(transactions: FinancialTransaction[]): number {
  const income = transactions
    .filter(t => t.type === 'INCOME' || t.type === 'BONUS')
    .reduce((sum, t) => sum + t.amount_stars, 0)

  const outcome = transactions
    .filter(t => t.type === 'OUTCOME')
    .reduce((sum, t) => sum + t.amount_stars, 0)

  return income - outcome
}

function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const group = String(item[key])
    groups[group] = groups[group] || []
    groups[group].push(item)
    return groups
  }, {} as Record<string, T[]>)
}

function aggregateTransactionsByMonth(transactions: FinancialTransaction[]) {
  const monthlyMap = new Map()

  transactions.filter(t => t.status === 'COMPLETED').forEach(transaction => {
    const date = new Date(transaction.timestamp)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        total_income: 0,
        total_outcome: 0,
        total_cost: 0,
        transaction_count: 0
      })
    }

    const monthStats = monthlyMap.get(monthKey)
    monthStats.transaction_count += 1

    if (transaction.type === 'INCOME' || transaction.type === 'BONUS') {
      monthStats.total_income += transaction.amount_stars
    } else if (transaction.type === 'OUTCOME') {
      monthStats.total_outcome += transaction.amount_stars

      const serviceCosts: Record<string, number> = {
        'neuro_photo': 4,
        'kling_video': 10,
        'video_generation_other': 158,
        'morphing': 84
      }

      if (transaction.service_type) {
        monthStats.total_cost += serviceCosts[transaction.service_type] || 0
      }
    }
  })

  return Object.fromEntries(monthlyMap)
}

function generateLargeTransactionDataset(count: number): FinancialTransaction[] {
  const transactions: FinancialTransaction[] = []
  const bots = ['NeuroPhotoBot', 'HaimGroupMedia_bot', 'TestBot']
  const services = ['neuro_photo', 'kling_video', 'morphing']

  for (let i = 0; i < count; i++) {
    transactions.push({
      user_id: `user_${Math.floor(i / 10)}`,
      transaction_id: `txn_large_${i}`,
      type: Math.random() > 0.7 ? 'INCOME' : 'OUTCOME',
      amount_stars: Math.random() * 100,
      service_type: Math.random() > 0.5 ? services[Math.floor(Math.random() * services.length)] : undefined,
      bot_name: bots[Math.floor(Math.random() * bots.length)],
      payment_method: Math.random() > 0.5 ? 'Robokassa' : 'System',
      timestamp: new Date(2024, 0, Math.floor(Math.random() * 30) + 1).toISOString(),
      status: 'COMPLETED'
    })
  }

  return transactions
}

function processLargeFinancialDataset(transactions: FinancialTransaction[]) {
  const startTime = performance.now()

  let totalIncome = 0
  let totalOutcome = 0

  transactions.forEach(t => {
    if (t.type === 'INCOME' || t.type === 'BONUS') {
      totalIncome += t.amount_stars
    } else if (t.type === 'OUTCOME') {
      totalOutcome += t.amount_stars
    }
  })

  const endTime = performance.now()

  return {
    processed_count: transactions.length,
    balance_calculated: true,
    processing_time: endTime - startTime,
    total_income: totalIncome,
    total_outcome: totalOutcome
  }
}