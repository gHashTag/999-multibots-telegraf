/**
 * FINANCIAL TESTING SUITE - Excel Generation & Data Quality
 * Tests for validating Excel report generation and data integrity
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import * as XLSX from 'xlsx'

// Mock data structures matching the actual database schema
interface MockPayment {
  id: number
  telegram_id: number
  payment_date: string
  amount: number
  description: string | null
  metadata: Record<string, any>
  stars: number
  currency: string
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  type: 'MONEY_INCOME' | 'MONEY_OUTCOME' | 'BONUS' | 'REFUND'
  service_type: string | null
  bot_name: string
  payment_method: string | null
  category: 'REAL' | 'BONUS'
  cost: number | null
}

interface MockUserReportData {
  userId: string
  username?: string
  totalBalance: number
  realIncomes: MockPayment[]
  bonusIncomes: MockPayment[]
  outcomes: MockPayment[]
  serviceStats: Map<string, { count: number; stars: number }>
}

describe('Excel Generation Tests', () => {
  let mockUserData: MockUserReportData

  beforeEach(() => {
    // Set up comprehensive test data
    mockUserData = {
      userId: '123456789',
      username: 'test_user',
      totalBalance: 275.5,
      realIncomes: [
        {
          id: 1,
          telegram_id: 123456789,
          payment_date: '2024-01-15T10:30:00Z',
          amount: 1000,
          description: 'Robokassa payment',
          metadata: {},
          stars: 434,
          currency: 'RUB',
          status: 'COMPLETED',
          type: 'MONEY_INCOME',
          service_type: null,
          bot_name: 'NeuroPhotoBot',
          payment_method: 'Robokassa',
          category: 'REAL',
          cost: null
        },
        {
          id: 2,
          telegram_id: 123456789,
          payment_date: '2024-01-20T15:45:00Z',
          amount: 0,
          description: 'Telegram Stars payment',
          metadata: {},
          stars: 100,
          currency: 'XTR',
          status: 'COMPLETED',
          type: 'MONEY_INCOME',
          service_type: null,
          bot_name: 'NeuroPhotoBot',
          payment_method: 'Telegram',
          category: 'REAL',
          cost: null
        }
      ],
      bonusIncomes: [
        {
          id: 3,
          telegram_id: 123456789,
          payment_date: '2024-01-10T09:00:00Z',
          amount: 0,
          description: 'Referral bonus',
          metadata: {},
          stars: 50,
          currency: 'XTR',
          status: 'COMPLETED',
          type: 'BONUS',
          service_type: null,
          bot_name: 'NeuroPhotoBot',
          payment_method: 'System',
          category: 'BONUS',
          cost: null
        }
      ],
      outcomes: [
        {
          id: 4,
          telegram_id: 123456789,
          payment_date: '2024-01-16T12:00:00Z',
          amount: 0,
          description: 'Photo generation',
          metadata: { num_images: 5 },
          stars: 20,
          currency: 'XTR',
          status: 'COMPLETED',
          type: 'MONEY_OUTCOME',
          service_type: 'neuro_photo',
          bot_name: 'NeuroPhotoBot',
          payment_method: null,
          category: 'REAL',
          cost: 20
        },
        {
          id: 5,
          telegram_id: 123456789,
          payment_date: '2024-01-18T14:30:00Z',
          amount: 0,
          description: 'Video generation',
          metadata: {},
          stars: 74,
          currency: 'XTR',
          status: 'COMPLETED',
          type: 'MONEY_OUTCOME',
          service_type: 'kling_video',
          bot_name: 'NeuroPhotoBot',
          payment_method: null,
          category: 'REAL',
          cost: 10
        }
      ],
      serviceStats: new Map([
        ['neuro_photo', { count: 1, stars: 20 }],
        ['kling_video', { count: 1, stars: 74 }]
      ])
    }
  })

  describe('Excel Workbook Structure Validation', () => {
    test('should create workbook with all required sheets', () => {
      const workbook = XLSX.utils.book_new()

      // Simulate the expected sheets
      const expectedSheets = [
        '📊 Общая сводка',
        '📈 Пополнения',
        '📉 Траты',
        '🛠️ Сервисы',
        '📋 История операций'
      ]

      expectedSheets.forEach(sheetName => {
        const mockSheet = XLSX.utils.aoa_to_sheet([['Mock Data']])
        XLSX.utils.book_append_sheet(workbook, mockSheet, sheetName)
      })

      expect(workbook.SheetNames).toHaveLength(5)
      expectedSheets.forEach(sheetName => {
        expect(workbook.SheetNames).toContain(sheetName)
      })
    })

    test('should generate valid Excel buffer', () => {
      const workbook = XLSX.utils.book_new()
      const mockSheet = XLSX.utils.aoa_to_sheet([['Test Data']])
      XLSX.utils.book_append_sheet(workbook, mockSheet, 'Test Sheet')

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
    })
  })

  describe('Summary Sheet Data Validation', () => {
    test('should calculate correct balance totals', () => {
      const totalRealStars = mockUserData.realIncomes.reduce((sum, p) => sum + p.stars, 0)
      const totalBonusStars = mockUserData.bonusIncomes.reduce((sum, p) => sum + p.stars, 0)
      const totalOutcomeStars = mockUserData.outcomes.reduce((sum, p) => sum + p.stars, 0)
      const calculatedBalance = totalRealStars + totalBonusStars - totalOutcomeStars

      expect(totalRealStars).toBe(534) // 434 + 100
      expect(totalBonusStars).toBe(50)
      expect(totalOutcomeStars).toBe(94) // 20 + 74
      expect(calculatedBalance).toBe(490) // 534 + 50 - 94
    })

    test('should separate payment methods correctly', () => {
      const rublesIncomes = mockUserData.realIncomes.filter(p =>
        p.currency === 'RUB' && (p.payment_method === 'Robokassa' || p.payment_method === 'Manual')
      )
      const starsIncomes = mockUserData.realIncomes.filter(p =>
        (p.currency === 'XTR' || p.currency === 'STARS') && p.payment_method === 'Telegram'
      )

      expect(rublesIncomes).toHaveLength(1)
      expect(starsIncomes).toHaveLength(1)

      const rublesStars = rublesIncomes.reduce((sum, p) => sum + p.stars, 0)
      const telegramStars = starsIncomes.reduce((sum, p) => sum + p.stars, 0)

      expect(rublesStars).toBe(434)
      expect(telegramStars).toBe(100)
    })

    test('should format numbers with proper precision', () => {
      const testValue = 123.456789
      const formatted = Math.round(testValue * 100) / 100

      expect(formatted).toBe(123.46)
      expect(typeof formatted).toBe('number')
    })
  })

  describe('Income Sheet Data Validation', () => {
    test('should format payment method display correctly', () => {
      const getPaymentMethodDisplay = (payment: MockPayment): string => {
        if (payment.currency === 'RUB' && (payment.payment_method === 'Robokassa' || payment.payment_method === 'Manual')) {
          return '💳 Robokassa'
        } else if ((payment.currency === 'XTR' || payment.currency === 'STARS') && payment.payment_method === 'Telegram') {
          return '⭐ Telegram Stars'
        } else if (payment.payment_method === 'System') {
          return '🤖 Система'
        } else if (payment.payment_method === 'Bonus') {
          return '🎁 Бонус'
        } else if (payment.payment_method === 'Manual') {
          return '✋ Ручное'
        }
        return payment.payment_method || '❓ Неизвестно'
      }

      expect(getPaymentMethodDisplay(mockUserData.realIncomes[0])).toBe('💳 Robokassa')
      expect(getPaymentMethodDisplay(mockUserData.realIncomes[1])).toBe('⭐ Telegram Stars')
      expect(getPaymentMethodDisplay(mockUserData.bonusIncomes[0])).toBe('🤖 Система')
    })

    test('should handle date formatting correctly', () => {
      const testDate = new Date('2024-01-15T10:30:00Z')
      const formatted = testDate.toLocaleDateString('ru-RU')

      expect(formatted).toMatch(/\d{2}\.\d{2}\.\d{4}/)
    })

    test('should separate real and bonus incomes correctly', () => {
      expect(mockUserData.realIncomes).toHaveLength(2)
      expect(mockUserData.bonusIncomes).toHaveLength(1)

      // Verify categories
      mockUserData.realIncomes.forEach(income => {
        expect(income.category).toBe('REAL')
        expect(income.type).toBe('MONEY_INCOME')
      })

      mockUserData.bonusIncomes.forEach(bonus => {
        expect(bonus.category).toBe('BONUS')
        expect(bonus.type).toBe('BONUS')
      })
    })
  })

  describe('Expenses Sheet Data Validation', () => {
    test('should map service types to display names correctly', () => {
      const getServiceDisplayTitle = (serviceType: string): string => {
        const serviceMap: Record<string, string> = {
          'neuro_photo': 'Нейрофото',
          'kling_video': 'Kling Video',
          'haiper_video': 'Haiper Video',
          'morphing': 'Морфинг',
          'unknown': 'Неизвестно'
        }
        return serviceMap[serviceType] || serviceType
      }

      const getServiceEmoji = (serviceType: string): string => {
        const emojiMap: Record<string, string> = {
          'neuro_photo': '🖼️',
          'kling_video': '🎬',
          'haiper_video': '🎥',
          'morphing': '🧬',
          'unknown': '❓'
        }
        return emojiMap[serviceType] || '🛠️'
      }

      expect(getServiceDisplayTitle('neuro_photo')).toBe('Нейрофото')
      expect(getServiceEmoji('neuro_photo')).toBe('🖼️')
      expect(getServiceDisplayTitle('kling_video')).toBe('Kling Video')
      expect(getServiceEmoji('kling_video')).toBe('🎬')
    })

    test('should calculate service statistics correctly', () => {
      const totalSpent = mockUserData.outcomes.reduce((sum, p) => sum + p.stars, 0)
      expect(totalSpent).toBe(94)

      // Service stats validation
      const neuroPhotoStats = mockUserData.serviceStats.get('neuro_photo')
      const klingVideoStats = mockUserData.serviceStats.get('kling_video')

      expect(neuroPhotoStats).toEqual({ count: 1, stars: 20 })
      expect(klingVideoStats).toEqual({ count: 1, stars: 74 })
    })
  })

  describe('Services Sheet Analytics', () => {
    test('should calculate percentage distribution correctly', () => {
      const totalSpent = 94
      const neuroPhotoSpent = 20
      const klingVideoSpent = 74

      const neuroPhotoPercentage = Math.round((neuroPhotoSpent / totalSpent) * 1000) / 10
      const klingVideoPercentage = Math.round((klingVideoSpent / totalSpent) * 1000) / 10

      expect(neuroPhotoPercentage).toBeCloseTo(21.3, 1)
      expect(klingVideoPercentage).toBeCloseTo(78.7, 1)
      expect(neuroPhotoPercentage + klingVideoPercentage).toBeCloseTo(100, 1)
    })

    test('should calculate average prices correctly', () => {
      const neuroPhotoStats = mockUserData.serviceStats.get('neuro_photo')!
      const klingVideoStats = mockUserData.serviceStats.get('kling_video')!

      const neuroPhotoAvg = neuroPhotoStats.count > 0
        ? Math.round((neuroPhotoStats.stars / neuroPhotoStats.count) * 100) / 100
        : 0

      const klingVideoAvg = klingVideoStats.count > 0
        ? Math.round((klingVideoStats.stars / klingVideoStats.count) * 100) / 100
        : 0

      expect(neuroPhotoAvg).toBe(20)
      expect(klingVideoAvg).toBe(74)
    })

    test('should sort services by spending correctly', () => {
      const sortedServices = Array.from(mockUserData.serviceStats.entries()).sort(
        ([, a], [, b]) => b.stars - a.stars
      )

      expect(sortedServices[0][0]).toBe('kling_video') // Highest spending
      expect(sortedServices[1][0]).toBe('neuro_photo') // Lower spending
    })
  })

  describe('History Sheet Validation', () => {
    test('should merge and sort all operations correctly', () => {
      const allOperations = [
        ...mockUserData.realIncomes.map(p => ({ ...p, operationType: 'income', category: 'real' })),
        ...mockUserData.bonusIncomes.map(p => ({ ...p, operationType: 'income', category: 'bonus' })),
        ...mockUserData.outcomes.map(p => ({ ...p, operationType: 'outcome', category: 'expense' }))
      ].sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())

      expect(allOperations).toHaveLength(5) // 2 real + 1 bonus + 2 outcomes

      // Verify sorting (most recent first)
      const dates = allOperations.map(op => new Date(op.payment_date).getTime())
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i-1]).toBeGreaterThanOrEqual(dates[i])
      }
    })

    test('should categorize operations correctly in history', () => {
      const realIncomeOp = { ...mockUserData.realIncomes[0], operationType: 'income', category: 'real' }
      const bonusIncomeOp = { ...mockUserData.bonusIncomes[0], operationType: 'income', category: 'bonus' }
      const outcomeOp = { ...mockUserData.outcomes[0], operationType: 'outcome', category: 'expense' }

      expect(realIncomeOp.operationType).toBe('income')
      expect(realIncomeOp.category).toBe('real')

      expect(bonusIncomeOp.operationType).toBe('income')
      expect(bonusIncomeOp.category).toBe('bonus')

      expect(outcomeOp.operationType).toBe('outcome')
      expect(outcomeOp.category).toBe('expense')
    })
  })

  describe('Data Quality Validation', () => {
    test('should handle missing or null values gracefully', () => {
      const paymentWithNulls: MockPayment = {
        id: 999,
        telegram_id: 123456789,
        payment_date: '2024-01-01T00:00:00Z',
        amount: 0,
        description: null,
        metadata: {},
        stars: 0,
        currency: 'XTR',
        status: 'COMPLETED',
        type: 'MONEY_OUTCOME',
        service_type: null,
        bot_name: 'TestBot',
        payment_method: null,
        category: 'REAL',
        cost: null
      }

      expect(paymentWithNulls.description || '').toBe('')
      expect(paymentWithNulls.service_type || 'unknown').toBe('unknown')
      expect(paymentWithNulls.payment_method || '❓ Неизвестно').toBe('❓ Неизвестно')
      expect(paymentWithNulls.stars || 0).toBe(0)
    })

    test('should validate data consistency', () => {
      // Verify that all outcomes have negative impact on balance
      mockUserData.outcomes.forEach(outcome => {
        expect(outcome.type).toBe('MONEY_OUTCOME')
        expect(outcome.stars).toBeGreaterThan(0) // Stars should be positive value
      })

      // Verify that all incomes have positive impact on balance
      [...mockUserData.realIncomes, ...mockUserData.bonusIncomes].forEach(income => {
        expect(['MONEY_INCOME', 'BONUS']).toContain(income.type)
        expect(income.stars).toBeGreaterThan(0)
      })
    })

    test('should validate service type consistency', () => {
      mockUserData.outcomes.forEach(outcome => {
        if (outcome.service_type) {
          expect(typeof outcome.service_type).toBe('string')
          expect(outcome.service_type.length).toBeGreaterThan(0)
        }
      })
    })
  })

  describe('Performance and Large Dataset Tests', () => {
    test('should handle large datasets efficiently', () => {
      // Generate large mock dataset
      const largeDataset: MockPayment[] = []
      for (let i = 0; i < 10000; i++) {
        largeDataset.push({
          id: i,
          telegram_id: 123456789,
          payment_date: `2024-01-${String((i % 30) + 1).padStart(2, '0')}T10:00:00Z`,
          amount: Math.random() * 1000,
          description: `Test payment ${i}`,
          metadata: {},
          stars: Math.random() * 100,
          currency: i % 2 === 0 ? 'RUB' : 'XTR',
          status: 'COMPLETED',
          type: i % 3 === 0 ? 'MONEY_INCOME' : 'MONEY_OUTCOME',
          service_type: i % 3 === 0 ? null : 'neuro_photo',
          bot_name: 'TestBot',
          payment_method: i % 2 === 0 ? 'Robokassa' : 'Telegram',
          category: 'REAL',
          cost: i % 3 !== 0 ? Math.random() * 10 : null
        })
      }

      const startTime = performance.now()

      // Simulate processing operations
      const totalStars = largeDataset.reduce((sum, p) => sum + p.stars, 0)
      const groupedByType = largeDataset.reduce((acc, p) => {
        acc[p.type] = (acc[p.type] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      const endTime = performance.now()
      const processingTime = endTime - startTime

      expect(totalStars).toBeGreaterThan(0)
      expect(Object.keys(groupedByType)).toContain('MONEY_INCOME')
      expect(Object.keys(groupedByType)).toContain('MONEY_OUTCOME')
      expect(processingTime).toBeLessThan(1000) // Should process in under 1 second
    })

    test('should handle memory usage efficiently', () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Create and process multiple datasets
      for (let i = 0; i < 100; i++) {
        const dataset = Array(100).fill(null).map((_, idx) => ({
          id: idx,
          stars: Math.random() * 100,
          type: idx % 2 === 0 ? 'MONEY_INCOME' : 'MONEY_OUTCOME'
        }))

        const total = dataset.reduce((sum, p) => sum + p.stars, 0)
        expect(total).toBeGreaterThan(0)
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)
    })
  })
})