#!/usr/bin/env tsx
/**
 * ⚠️ НЕ РАБОТАЕТ: импортирует '../src/utils/enhancedExcelGenerator', которого
 * в репозитории нет — модуль не был закоммичен. Команды report:financial /
 * report:bot / report:monthly / report:test убраны из package.json: они
 * падали с «Cannot find module» при каждом запуске, то есть предлагали
 * несуществующую возможность.
 *
 * Файл оставлен как есть: логика отчёта в нём настоящая, не хватает одного
 * модуля. Верните его — и верните команды.
 */

/**
 * Enhanced Financial Report Generator Script
 *
 * Generates beautiful Excel reports with corrected financial logic
 * Usage: npx tsx scripts/generateFinancialReport.ts [options]
 */

import {
  generateEnhancedFinancialExcel,
  generateAndSaveExcelReport,
  ExcelGenerationOptions,
} from '../src/utils/enhancedExcelGenerator'
import { logger } from '../src/utils/logger'
import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'

interface CLIOptions {
  startDate?: string
  endDate?: string
  botName?: string
  month?: string
  output?: string
  includeVirtual?: boolean
  includeDaily?: boolean
  verbose?: boolean
}

async function main() {
  const program = new Command()

  program
    .name('financial-report-generator')
    .description(
      '🚀 Enhanced Excel Financial Report Generator with Beautiful Design'
    )
    .version('2.0.0')

  program
    .option('-s, --start-date <date>', 'Start date (YYYY-MM-DD)')
    .option('-e, --end-date <date>', 'End date (YYYY-MM-DD)')
    .option('-b, --bot-name <name>', 'Specific bot name to analyze')
    .option('-m, --month <month>', 'Month for billing (YYYY-MM)')
    .option('-o, --output <path>', 'Output file path')
    .option('--include-virtual', 'Include virtual transactions', false)
    .option('--include-daily', 'Include daily breakdown', false)
    .option('-v, --verbose', 'Verbose logging', false)

  program.parse()

  const options: CLIOptions = program.opts()

  if (options.verbose) {
    logger.info('🚀 Starting Enhanced Financial Report Generation')
    logger.info('📊 Configuration:', options)
  }

  try {
    // Parse dates
    const excelOptions: ExcelGenerationOptions = {
      includeVirtualTransactions: options.includeVirtual,
      includeDailyBreakdown: options.includeDaily,
    }

    if (options.startDate) {
      excelOptions.startDate = new Date(options.startDate)
      if (isNaN(excelOptions.startDate.getTime())) {
        throw new Error(`Invalid start date: ${options.startDate}`)
      }
    }

    if (options.endDate) {
      excelOptions.endDate = new Date(options.endDate)
      if (isNaN(excelOptions.endDate.getTime())) {
        throw new Error(`Invalid end date: ${options.endDate}`)
      }
    }

    if (options.botName) {
      excelOptions.botName = options.botName
    }

    if (options.month) {
      if (!/^\d{4}-\d{2}$/.test(options.month)) {
        throw new Error(`Invalid month format: ${options.month}. Use YYYY-MM`)
      }
      excelOptions.month = options.month
    }

    // Generate report
    logger.info('📊 Generating comprehensive financial report...')
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .split('T')[0]
    const defaultFilename = `financial-report-enhanced-${timestamp}.xlsx`

    const outputPath =
      options.output || path.join(process.cwd(), 'reports', defaultFilename)

    // Ensure reports directory exists
    const reportsDir = path.dirname(outputPath)
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true })
      logger.info(`📁 Created reports directory: ${reportsDir}`)
    }

    // Generate Excel buffer
    const buffer = await generateEnhancedFinancialExcel(excelOptions)

    // Write to file
    fs.writeFileSync(outputPath, buffer)

    const stats = fs.statSync(outputPath)
    const fileSizeKB = (stats.size / 1024).toFixed(2)

    logger.info('✅ Financial report generated successfully!')
    logger.info(`📄 File: ${outputPath}`)
    logger.info(`📊 Size: ${fileSizeKB} KB`)
    logger.info(`📅 Generated: ${new Date().toLocaleString('ru-RU')}`)

    // Print summary
    console.log('\n🎉 SUCCESS! Enhanced Financial Report Generated')
    console.log('='.repeat(60))
    console.log(`📊 Report Includes:`)
    console.log(`   📈 Executive Summary with Platform Overview`)
    console.log(`   💰 Real vs Virtual Revenue Analysis`)
    console.log(`   📅 Monthly Bot Performance Trends`)
    console.log(`   🤖 Bot Owner Billing Statements`)
    console.log(`   ⭐ Star-to-Ruble Exchange Analysis`)
    console.log(`   📊 Profitability Dashboard`)
    console.log('='.repeat(60))
    console.log(`📁 File Location: ${outputPath}`)
    console.log(`📦 File Size: ${fileSizeKB} KB`)

    if (excelOptions.startDate || excelOptions.endDate) {
      console.log(
        `📅 Date Range: ${excelOptions.startDate?.toLocaleDateString('ru-RU') || 'Beginning'} - ${excelOptions.endDate?.toLocaleDateString('ru-RU') || 'Today'}`
      )
    }

    if (excelOptions.botName) {
      console.log(`🤖 Bot Filter: ${excelOptions.botName}`)
    }

    if (excelOptions.month) {
      console.log(`📊 Monthly Billing: ${excelOptions.month}`)
    }

    console.log('\n💡 Tips for Excel Usage:')
    console.log('   🎨 Rich emoji formatting for visual appeal')
    console.log('   📊 Multiple sheets for different analyses')
    console.log('   💰 Transparent financial calculations')
    console.log('   📈 Conditional formatting for profit/loss')
    console.log('   🔍 Filter and sort data for deeper insights')
  } catch (error: any) {
    logger.error('❌ Error generating financial report:', error)
    console.error('\n💥 ERROR:', error.message)

    if (options.verbose && error.stack) {
      console.error('\n📋 Stack Trace:')
      console.error(error.stack)
    }

    console.error('\n🔧 Troubleshooting:')
    console.error('   1. Check database connection')
    console.error('   2. Verify date formats (YYYY-MM-DD)')
    console.error('   3. Ensure bot name exists in database')
    console.error('   4. Check file permissions for output directory')

    process.exit(1)
  }
}

// Example usage documentation
function printExamples() {
  console.log('\n📚 Example Usage:')
  console.log('='.repeat(60))
  console.log('# Generate full platform report')
  console.log('npx tsx scripts/generateFinancialReport.ts')
  console.log('')
  console.log('# Generate report for specific date range')
  console.log(
    'npx tsx scripts/generateFinancialReport.ts -s 2024-01-01 -e 2024-01-31'
  )
  console.log('')
  console.log('# Generate report for specific bot')
  console.log('npx tsx scripts/generateFinancialReport.ts -b "neurogpt_bot"')
  console.log('')
  console.log('# Generate monthly billing report')
  console.log('npx tsx scripts/generateFinancialReport.ts -m 2024-01')
  console.log('')
  console.log('# Generate report with virtual transactions')
  console.log('npx tsx scripts/generateFinancialReport.ts --include-virtual')
  console.log('')
  console.log('# Generate verbose report with daily breakdown')
  console.log('npx tsx scripts/generateFinancialReport.ts --include-daily -v')
  console.log('')
  console.log('# Custom output location')
  console.log(
    'npx tsx scripts/generateFinancialReport.ts -o /path/to/custom-report.xlsx'
  )
  console.log('='.repeat(60))
}

// Run main function
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Unhandled error:', error)
    process.exit(1)
  })
}

export { main as generateFinancialReportCLI }
