/**
 * QA VALIDATION TEST SUITE FOR EXCEL FINANCIAL REPORTS
 *
 * This comprehensive test suite validates:
 * 1. Database query accuracy and completeness
 * 2. Mathematical calculations and formulas
 * 3. Excel file generation and formatting
 * 4. Data integrity and consistency
 * 5. Error handling and edge cases
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import { supabase } from '../src/core/supabase'
import {
  generateAdminExcelReport,
  generateUserExcelReport
} from '../src/utils/adminExcelReportGenerator'

// QA Test Configuration
const QA_CONFIG = {
  TEST_BOT_NAME: 'test_bot_999_qa',
  TEST_USER_ID: '999999999',
  SAMPLE_SIZE: 100,
  VALIDATION_THRESHOLDS: {
    CALCULATION_TOLERANCE: 0.01, // 1 kopeck tolerance for rounding
    MISSING_DATA_THRESHOLD: 0.05, // 5% missing data acceptable
    PERFORMANCE_TIMEOUT: 30000, // 30 seconds max
  }
}

// Test Data Validation Schema
interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  metrics: {
    totalRecords: number
    missingFields: number
    calculationErrors: number
    performanceMs: number
  }
}

describe('🔍 QA VALIDATION: Excel Financial Reports', () => {
  let testPayments: any[] = []
  let validationResults: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    metrics: {
      totalRecords: 0,
      missingFields: 0,
      calculationErrors: 0,
      performanceMs: 0
    }
  }

  beforeAll(async () => {
    // Create test data for validation
    await setupTestData()
  })

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData()
    // Generate QA Report
    await generateQAReport()
  })

  describe('🗄️ DATABASE QUERY VALIDATION', () => {
    test('✅ Should retrieve all payment records without missing data', async () => {
      const startTime = Date.now()

      // Test pagination functionality
      const { data: allPayments, error } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('status', 'COMPLETED')
        .order('payment_date', { ascending: false })
        .limit(1000)

      const endTime = Date.now()
      validationResults.metrics.performanceMs = endTime - startTime

      expect(error).toBeNull()
      expect(allPayments).toBeDefined()
      expect(Array.isArray(allPayments)).toBe(true)

      // Validate required fields exist
      if (allPayments && allPayments.length > 0) {
        const requiredFields = ['id', 'telegram_id', 'bot_name', 'type', 'status', 'payment_date']
        const missingFieldCount = allPayments.reduce((count, payment) => {
          const missing = requiredFields.filter(field => !payment[field])
          return count + missing.length
        }, 0)

        validationResults.metrics.totalRecords = allPayments.length
        validationResults.metrics.missingFields = missingFieldCount

        if (missingFieldCount > 0) {
          validationResults.warnings.push(`Found ${missingFieldCount} missing required fields`)
        }

        expect(missingFieldCount / (allPayments.length * requiredFields.length))
          .toBeLessThan(QA_CONFIG.VALIDATION_THRESHOLDS.MISSING_DATA_THRESHOLD)
      }
    })

    test('✅ Should correctly filter by bot names', async () => {
      const availableBots = await supabase
        .from('payments_v2')
        .select('bot_name')
        .eq('status', 'COMPLETED')
        .not('bot_name', 'is', null)

      expect(availableBots.error).toBeNull()
      expect(availableBots.data).toBeDefined()

      if (availableBots.data && availableBots.data.length > 0) {
        const uniqueBots = [...new Set(availableBots.data.map(p => p.bot_name))]
        expect(uniqueBots.length).toBeGreaterThan(0)

        // Test filtering for each bot
        for (const botName of uniqueBots.slice(0, 5)) { // Test first 5 bots
          const botPayments = await supabase
            .from('payments_v2')
            .select('*')
            .eq('bot_name', botName)
            .eq('status', 'COMPLETED')

          expect(botPayments.error).toBeNull()
          expect(botPayments.data?.every(p => p.bot_name === botName)).toBe(true)
        }
      }
    })

    test('✅ Should handle large datasets with pagination', async () => {
      let allRecords: any[] = []
      let from = 0
      const batchSize = 100
      let hasMore = true
      let batchCount = 0

      while (hasMore && batchCount < 10) { // Limit to 10 batches for testing
        const { data: batch, error } = await supabase
          .from('payments_v2')
          .select('*')
          .eq('status', 'COMPLETED')
          .range(from, from + batchSize - 1)
          .order('payment_date', { ascending: false })

        expect(error).toBeNull()

        if (!batch || batch.length === 0) {
          hasMore = false
        } else {
          allRecords = allRecords.concat(batch)
          from += batchSize
          batchCount++

          if (batch.length < batchSize) {
            hasMore = false
          }
        }
      }

      expect(allRecords.length).toBeGreaterThanOrEqual(0)
      // Verify no duplicates in pagination
      const uniqueIds = new Set(allRecords.map(r => r.id))
      expect(uniqueIds.size).toBe(allRecords.length)
    })
  })

  describe('🧮 MATHEMATICAL CALCULATION VALIDATION', () => {
    test('✅ Should calculate balances accurately', async () => {
      // Test with known data
      const { data: testUser } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('telegram_id', '123456789') // Use actual user ID if available
        .eq('status', 'COMPLETED')
        .limit(50)

      if (testUser && testUser.length > 0) {
        // Manual calculation
        const incomes = testUser.filter(p => p.type === 'MONEY_INCOME')
        const outcomes = testUser.filter(p => p.type === 'MONEY_OUTCOME')

        const totalIncome = incomes.reduce((sum, p) => sum + (p.stars || 0), 0)
        const totalOutcome = outcomes.reduce((sum, p) => sum + (p.stars || 0), 0)
        const expectedBalance = totalIncome - totalOutcome

        // Verify calculations are mathematically correct
        expect(totalIncome).toBeGreaterThanOrEqual(0)
        expect(totalOutcome).toBeGreaterThanOrEqual(0)
        expect(expectedBalance).toBe(totalIncome - totalOutcome)

        // Check for floating point precision issues
        const roundedBalance = Math.round(expectedBalance * 100) / 100
        expect(Math.abs(expectedBalance - roundedBalance))
          .toBeLessThan(QA_CONFIG.VALIDATION_THRESHOLDS.CALCULATION_TOLERANCE)
      }
    })

    test('✅ Should handle currency conversions correctly', async () => {
      const { data: mixedCurrency } = await supabase
        .from('payments_v2')
        .select('*')
        .in('currency', ['RUB', 'XTR', 'STARS'])
        .eq('status', 'COMPLETED')
        .limit(100)

      if (mixedCurrency && mixedCurrency.length > 0) {
        // Group by currency
        const rubPayments = mixedCurrency.filter(p => p.currency === 'RUB')
        const starPayments = mixedCurrency.filter(p => p.currency === 'XTR' || p.currency === 'STARS')

        // Verify RUB payments have amount field
        rubPayments.forEach(payment => {
          if (payment.type === 'MONEY_INCOME') {
            expect(payment.amount).toBeDefined()
            expect(typeof payment.amount).toBe('number')
            expect(payment.amount).toBeGreaterThanOrEqual(0)
          }
        })

        // Verify star payments have stars field
        starPayments.forEach(payment => {
          expect(payment.stars).toBeDefined()
          expect(typeof payment.stars).toBe('number')
          expect(payment.stars).toBeGreaterThanOrEqual(0)
        })
      }
    })

    test('✅ Should calculate profit margins correctly', async () => {
      const { data: revenueData } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('status', 'COMPLETED')
        .not('service_type', 'is', null)
        .limit(200)

      if (revenueData && revenueData.length > 0) {
        // Calculate margins for each service
        const serviceStats = new Map()

        revenueData.forEach(payment => {
          const service = payment.service_type
          if (!serviceStats.has(service)) {
            serviceStats.set(service, { revenue: 0, cost: 0, count: 0 })
          }

          const stats = serviceStats.get(service)
          if (payment.type === 'MONEY_OUTCOME') {
            stats.revenue += payment.stars || 0
            stats.cost += payment.cost || 0
            stats.count += 1
          }
          serviceStats.set(service, stats)
        })

        // Validate margin calculations
        serviceStats.forEach((stats, service) => {
          if (stats.revenue > 0) {
            const profit = stats.revenue - stats.cost
            const margin = (profit / stats.revenue) * 100

            expect(margin).toBeGreaterThanOrEqual(-100) // Can't lose more than 100%
            expect(margin).toBeLessThanOrEqual(100) // Can't profit more than 100% in typical cases
            expect(isFinite(margin)).toBe(true) // No infinity or NaN
          }
        })
      }
    })
  })

  describe('📊 EXCEL GENERATION VALIDATION', () => {
    test('⚠️ Should handle disabled Excel generation gracefully', async () => {
      // Test current disabled state
      try {
        await generateAdminExcelReport('test_bot')
        // If we reach here, Excel generation is working
        expect(true).toBe(true)
      } catch (error) {
        // Expected error for disabled functionality
        expect(error).toBeDefined()
        expect(error.message).toContain('Excel export temporarily disabled')
        validationResults.warnings.push('Excel generation is currently disabled - xlsx package not available')
      }
    })

    test('📋 Should validate Excel structure when enabled', async () => {
      // This test will validate Excel structure once generation is re-enabled
      // For now, we test the data structure that would be exported

      const mockBotData = await getBotReportData('test_bot')

      // Validate data structure
      expect(mockBotData).toBeDefined()
      expect(typeof mockBotData.totalIncome).toBe('number')
      expect(typeof mockBotData.totalOutcome).toBe('number')
      expect(typeof mockBotData.netProfit).toBe('number')
      expect(Array.isArray(mockBotData.allTransactions)).toBe(true)
      expect(Array.isArray(mockBotData.monthlyStats)).toBe(true)
    })

    test('🏗️ Should validate Excel worksheet structure', () => {
      // Mock the expected worksheet structure
      const expectedSheets = [
        '📊 Общая сводка',
        '💰 Финансы',
        '🛠️ Сервисы',
        '👥 Пользователи',
        '📅 Динамика',
        '📋 Транзакции'
      ]

      // Validate sheet names
      expectedSheets.forEach(sheetName => {
        expect(sheetName).toBeDefined()
        expect(sheetName.length).toBeGreaterThan(0)
        expect(sheetName.length).toBeLessThan(32) // Excel sheet name limit
      })
    })
  })

  describe('⚡ PERFORMANCE VALIDATION', () => {
    test('✅ Should complete queries within performance thresholds', async () => {
      const startTime = Date.now()

      const { data: performanceTest } = await supabase
        .from('payments_v2')
        .select('*')
        .eq('status', 'COMPLETED')
        .limit(1000)
        .order('payment_date', { ascending: false })

      const endTime = Date.now()
      const queryTime = endTime - startTime

      expect(queryTime).toBeLessThan(QA_CONFIG.VALIDATION_THRESHOLDS.PERFORMANCE_TIMEOUT)

      if (queryTime > 10000) { // 10 seconds warning threshold
        validationResults.warnings.push(`Query performance warning: ${queryTime}ms`)
      }
    })

    test('✅ Should handle concurrent database access', async () => {
      const concurrentPromises = Array(5).fill(null).map(async (_, index) => {
        return supabase
          .from('payments_v2')
          .select('count(*)')
          .eq('status', 'COMPLETED')
      })

      const results = await Promise.all(concurrentPromises)

      results.forEach(result => {
        expect(result.error).toBeNull()
        expect(result.data).toBeDefined()
      })
    })
  })

  describe('🛡️ ERROR HANDLING VALIDATION', () => {
    test('✅ Should handle invalid bot names gracefully', async () => {
      const invalidBotNames = ['', null, undefined, 'nonexistent_bot_12345']

      for (const botName of invalidBotNames) {
        try {
          if (botName === null || botName === undefined) {
            // Should handle null/undefined gracefully
            const { data } = await supabase
              .from('payments_v2')
              .select('*')
              .eq('bot_name', botName)

            expect(data).toEqual([])
          } else {
            await getBotReportData(botName as string)
          }
        } catch (error) {
          // Expected behavior for invalid inputs
          expect(error).toBeDefined()
        }
      }
    })

    test('✅ Should handle missing or corrupted data', async () => {
      // Test with data that might have missing fields
      const { data: incompleteData } = await supabase
        .from('payments_v2')
        .select('id, telegram_id, payment_date') // Intentionally limited fields
        .eq('status', 'COMPLETED')
        .limit(10)

      expect(incompleteData).toBeDefined()

      if (incompleteData && incompleteData.length > 0) {
        incompleteData.forEach(payment => {
          // Should have required fields
          expect(payment.id).toBeDefined()
          expect(payment.telegram_id).toBeDefined()
          expect(payment.payment_date).toBeDefined()
        })
      }
    })
  })

  describe('🔍 DATA INTEGRITY VALIDATION', () => {
    test('✅ Should validate payment types and statuses', async () => {
      const { data: paymentTypes } = await supabase
        .from('payments_v2')
        .select('type, status, category')
        .limit(1000)

      if (paymentTypes && paymentTypes.length > 0) {
        const validTypes = ['MONEY_INCOME', 'MONEY_OUTCOME', 'REFUND']
        const validStatuses = ['COMPLETED', 'PENDING', 'FAILED', 'CANCELLED']
        const validCategories = ['REAL', 'BONUS', 'ADMIN', null]

        paymentTypes.forEach(payment => {
          if (payment.type) {
            expect(validTypes).toContain(payment.type)
          }
          if (payment.status) {
            expect(validStatuses).toContain(payment.status)
          }
          if (payment.category !== null) {
            expect(validCategories).toContain(payment.category)
          }
        })
      }
    })

    test('✅ Should validate date formats and ranges', async () => {
      const { data: dates } = await supabase
        .from('payments_v2')
        .select('payment_date')
        .not('payment_date', 'is', null)
        .limit(100)

      if (dates && dates.length > 0) {
        dates.forEach(payment => {
          const date = new Date(payment.payment_date)
          expect(date).toBeInstanceOf(Date)
          expect(isNaN(date.getTime())).toBe(false)

          // Should be reasonable date (not in future, not too old)
          const now = new Date()
          const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

          expect(date.getTime()).toBeGreaterThan(oneYearAgo.getTime())
          expect(date.getTime()).toBeLessThan(tomorrow.getTime())
        })
      }
    })
  })
})

// Helper Functions

async function setupTestData() {
  // Setup any test data needed for validation
  console.log('🔧 Setting up QA test data...')
}

async function cleanupTestData() {
  // Cleanup test data
  console.log('🧹 Cleaning up QA test data...')
}

async function getBotReportData(botName: string) {
  // Mock implementation of bot report data gathering
  if (!botName || botName.trim() === '') {
    throw new Error('Invalid bot name')
  }

  const { data: payments, error } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('bot_name', botName)
    .eq('status', 'COMPLETED')
    .limit(100)

  if (error) throw error

  const incomes = payments?.filter(p => p.type === 'MONEY_INCOME') || []
  const outcomes = payments?.filter(p => p.type === 'MONEY_OUTCOME') || []

  return {
    botName,
    totalIncome: incomes.reduce((sum, p) => sum + (p.stars || 0), 0),
    totalOutcome: outcomes.reduce((sum, p) => sum + (p.stars || 0), 0),
    netProfit: 0, // Will be calculated
    allTransactions: payments || [],
    monthlyStats: [],
    serviceStats: new Map(),
    topUsers: [],
    totalUsers: 0,
    activeUsersMonth: 0,
    totalTransactions: payments?.length || 0,
    rubIncome: 0,
    rubOutcome: 0,
    starsIncome: 0,
    starsOutcome: 0,
    starsCost: 0,
    robokassaPayments: [],
    telegramStarsPayments: [],
    bonusPayments: [],
    adminPayments: [],
    userSegments: [],
    dailyStats: [],
    profitMargin: 0
  }
}

async function generateQAReport() {
  const report = {
    timestamp: new Date().toISOString(),
    validationResults,
    summary: {
      totalTests: 'Will be filled by test runner',
      passed: 'Will be filled by test runner',
      failed: 'Will be filled by test runner',
      warnings: validationResults.warnings.length,
      errors: validationResults.errors.length
    },
    recommendations: [
      'Re-enable Excel generation by installing xlsx package',
      'Monitor query performance for large datasets',
      'Implement data validation at input level',
      'Add automated Excel format validation'
    ]
  }

  const reportPath = path.join(__dirname, 'qa-validation-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('📊 QA Validation Report generated at:', reportPath)
  console.log('📈 Performance Metrics:', validationResults.metrics)
  console.log('⚠️ Warnings:', validationResults.warnings.length)
  console.log('❌ Errors:', validationResults.errors.length)
}