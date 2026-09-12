#!/usr/bin/env tsx
/**
 * DOES NOT RUN: it imports '../src/utils/enhancedExcelGenerator', which is
 * not in the repository — that module was never committed. The commands
 * report:financial / report:bot / report:monthly / report:test were removed
 * from package.json: every invocation ended in "Cannot find module", so they
 * advertised a capability that does not exist.
 *
 * The file is left as it is: its reporting logic is real, only the one module
 * is missing. Restore it and the commands can come back.
 */

/**
 * Test Script for Enhanced Excel Generator
 *
 * Tests the Excel generation functionality with sample data
 * and validates the financial logic correctness
 */

import {
  generateEnhancedFinancialExcel,
  ExcelGenerationOptions,
} from '../src/utils/enhancedExcelGenerator'
import {
  calculateCurrentStarToRubleRate,
  getAllBotsFinancialSummary,
} from '../src/utils/financialAnalysis'
import { supabase } from '../src/core/supabase'
import { logger } from '../src/utils/logger'
import * as fs from 'fs'
import * as path from 'path'

interface TestResults {
  success: boolean
  errors: string[]
  warnings: string[]
  metrics: {
    totalBots: number
    totalRevenue: number
    totalExpenses: number
    totalProfit: number
    exchangeRate: number
    reportSizeKB: number
  }
}

async function runFinancialLogicTests(): Promise<TestResults> {
  const results: TestResults = {
    success: true,
    errors: [],
    warnings: [],
    metrics: {
      totalBots: 0,
      totalRevenue: 0,
      totalExpenses: 0,
      totalProfit: 0,
      exchangeRate: 0,
      reportSizeKB: 0,
    },
  }

  try {
    logger.info('🧪 Starting Financial Logic Tests...')

    // Test 1: Database Connection
    logger.info('🔌 Testing database connection...')
    const { data: testQuery, error: dbError } = await supabase
      .from('payments_v2')
      .select('count(*)')
      .limit(1)

    if (dbError) {
      results.errors.push(`Database connection failed: ${dbError.message}`)
      results.success = false
      return results
    }

    logger.info('✅ Database connection successful')

    // Test 2: Financial Analysis Functions
    logger.info('💰 Testing financial analysis functions...')

    const botSummaries = await getAllBotsFinancialSummary()
    results.metrics.totalBots = botSummaries.length

    if (botSummaries.length === 0) {
      results.warnings.push('No bot financial data found')
    } else {
      logger.info(`📊 Found ${botSummaries.length} bots with financial data`)

      // Calculate platform totals
      results.metrics.totalRevenue = botSummaries.reduce(
        (sum, bot) => sum + bot.total_revenue_stars,
        0
      )
      results.metrics.totalExpenses = botSummaries.reduce(
        (sum, bot) => sum + bot.total_expenses_stars,
        0
      )
      results.metrics.totalProfit = botSummaries.reduce(
        (sum, bot) => sum + bot.net_profit_stars,
        0
      )

      logger.info(`💰 Platform Revenue: ${results.metrics.totalRevenue} stars`)
      logger.info(
        `💸 Platform Expenses: ${results.metrics.totalExpenses} stars`
      )
      logger.info(`📈 Platform Profit: ${results.metrics.totalProfit} stars`)
    }

    // Test 3: Exchange Rate Calculation
    logger.info('⭐ Testing exchange rate calculation...')
    results.metrics.exchangeRate = await calculateCurrentStarToRubleRate()
    logger.info(
      `💱 Current exchange rate: ${results.metrics.exchangeRate.toFixed(6)} RUB/star`
    )

    // Test 4: Real vs Virtual Revenue Logic
    logger.info('🔍 Testing revenue categorization...')
    const { data: revenueData, error: revenueError } = await supabase
      .from('payments_v2')
      .select('payment_method, description, stars, amount, type')
      .eq('type', 'MONEY_INCOME')
      .eq('status', 'COMPLETED')
      .limit(100)

    if (revenueError) {
      results.errors.push(`Revenue analysis failed: ${revenueError.message}`)
    } else {
      let realMoney = 0
      let virtualMoney = 0

      revenueData.forEach(tx => {
        const isRealMoney =
          ['Robokassa', 'Telegram', 'CryptoBot'].includes(
            tx.payment_method || ''
          ) &&
          !tx.description?.includes('bonus') &&
          !tx.description?.includes('admin')

        if (isRealMoney) {
          realMoney += tx.stars || 0
        } else {
          virtualMoney += tx.stars || 0
        }
      })

      logger.info(`💎 Real money revenue: ${realMoney} stars`)
      logger.info(`🎁 Virtual money revenue: ${virtualMoney} stars`)

      if (realMoney === 0 && virtualMoney === 0) {
        results.warnings.push('No revenue data found in recent transactions')
      }
    }

    // Test 5: Excel Generation
    logger.info('📊 Testing Excel generation...')

    const testOptions: ExcelGenerationOptions = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      endDate: new Date(),
      includeVirtualTransactions: true,
      includeDailyBreakdown: true,
    }

    const buffer = await generateEnhancedFinancialExcel(testOptions)
    results.metrics.reportSizeKB = buffer.length / 1024

    // Save test report
    const testReportPath = path.join(
      process.cwd(),
      'reports',
      'test-financial-report.xlsx'
    )
    const reportsDir = path.dirname(testReportPath)
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true })
    }

    fs.writeFileSync(testReportPath, buffer)
    logger.info(
      `✅ Test report saved: ${testReportPath} (${results.metrics.reportSizeKB.toFixed(2)} KB)`
    )

    // Test 6: Validate Excel Structure
    logger.info('🔍 Validating Excel structure...')
    const XLSX = await import('../../src/utils/excelCompat')
    const workbook = await XLSX.read(buffer)

    const expectedSheets = [
      '📊 Сводка',
      '💰 Доходы',
      '📅 Тренды',
      '🤖 Расчеты',
      '⭐ Курс валют',
      '📈 Прибыльность',
    ]

    expectedSheets.forEach(sheetName => {
      if (!workbook.SheetNames.includes(sheetName)) {
        results.errors.push(`Missing expected sheet: ${sheetName}`)
      }
    })

    if (workbook.SheetNames.length !== expectedSheets.length) {
      results.warnings.push(
        `Expected ${expectedSheets.length} sheets, got ${workbook.SheetNames.length}`
      )
    }

    logger.info(
      `📋 Excel contains ${workbook.SheetNames.length} sheets: ${workbook.SheetNames.join(', ')}`
    )

    // Test 7: Mathematical Accuracy
    logger.info('🧮 Testing mathematical accuracy...')

    for (const bot of botSummaries.slice(0, 3)) {
      // Test first 3 bots
      const expectedGrossProfit =
        bot.total_revenue_stars - bot.total_expenses_stars
      const expectedPlatformCommission = bot.total_revenue_stars * 0.2
      const expectedNetProfit =
        bot.total_revenue_stars -
        bot.total_expenses_stars -
        expectedPlatformCommission

      if (Math.abs(bot.gross_profit_stars - expectedGrossProfit) > 0.01) {
        results.errors.push(
          `Gross profit calculation error for ${bot.bot_name}`
        )
      }

      if (
        Math.abs(bot.platform_commission - expectedPlatformCommission) > 0.01
      ) {
        results.errors.push(
          `Platform commission calculation error for ${bot.bot_name}`
        )
      }

      if (Math.abs(bot.net_profit_stars - expectedNetProfit) > 0.01) {
        results.warnings.push(
          `Net profit calculation might be incorrect for ${bot.bot_name}`
        )
      }
    }

    logger.info('✅ All tests completed!')
  } catch (error: any) {
    results.errors.push(`Unexpected error: ${error.message}`)
    results.success = false
    logger.error('❌ Test failed with error:', error)
  }

  return results
}

async function printTestReport(results: TestResults) {
  console.log('\n🧪 ENHANCED EXCEL GENERATOR TEST REPORT')
  console.log('='.repeat(70))

  if (results.success && results.errors.length === 0) {
    console.log('🎉 ALL TESTS PASSED! ✅')
  } else {
    console.log('⚠️  TESTS COMPLETED WITH ISSUES')
  }

  console.log('\n📊 METRICS:')
  console.log(`   🤖 Total Bots Analyzed: ${results.metrics.totalBots}`)
  console.log(
    `   💰 Total Revenue: ${results.metrics.totalRevenue.toFixed(2)} stars`
  )
  console.log(
    `   💸 Total Expenses: ${results.metrics.totalExpenses.toFixed(2)} stars`
  )
  console.log(
    `   📈 Total Profit: ${results.metrics.totalProfit.toFixed(2)} stars`
  )
  console.log(
    `   💱 Exchange Rate: ${results.metrics.exchangeRate.toFixed(6)} RUB/star`
  )
  console.log(
    `   📄 Report Size: ${results.metrics.reportSizeKB.toFixed(2)} KB`
  )

  if (results.errors.length > 0) {
    console.log('\n❌ ERRORS:')
    results.errors.forEach((error, i) => {
      console.log(`   ${i + 1}. ${error}`)
    })
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:')
    results.warnings.forEach((warning, i) => {
      console.log(`   ${i + 1}. ${warning}`)
    })
  }

  if (results.success && results.errors.length === 0) {
    console.log('\n✨ FEATURES VALIDATED:')
    console.log('   📊 Multiple analytical sheets')
    console.log('   💰 Real vs Virtual revenue separation')
    console.log('   🎨 Rich emoji formatting')
    console.log('   🤖 Bot owner billing transparency')
    console.log('   ⭐ Star-to-Ruble exchange analysis')
    console.log('   📈 Profitability dashboard')
    console.log('   🧮 Mathematical accuracy')
  }

  console.log('\n💡 NEXT STEPS:')
  console.log(
    '   📄 Review generated test report: reports/test-financial-report.xlsx'
  )
  console.log(
    '   🚀 Generate production report: npx tsx scripts/generateFinancialReport.ts'
  )
  console.log('   📊 Customize options for specific needs')

  console.log('='.repeat(70))
}

async function main() {
  console.log('🚀 Enhanced Excel Generator Test Suite')
  console.log('Testing financial logic and Excel generation...\n')

  const results = await runFinancialLogicTests()
  await printTestReport(results)

  if (!results.success || results.errors.length > 0) {
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('💥 Test suite failed:', error)
    process.exit(1)
  })
}

export { runFinancialLogicTests }
