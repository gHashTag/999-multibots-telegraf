#!/usr/bin/env node

/**
 * 🧪 AI PHOTOSHOP DIALOG MODE TEST RUNNER
 *
 * Runs the complete AI Photoshop dialog mode test suite
 * Including:
 * - Dialog mode workflow tests
 * - Schema validation tests
 * - Performance tests
 * - Regression prevention tests
 */

import { execSync } from 'child_process'
import path from 'path'

const testFiles = [
  'dialog-mode.test.ts',
  'schema-validation.test.ts',
  'performance.test.ts',
  'integration/regression-prevention.test.ts'
]

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function runTest(testFile: string): { success: boolean; output: string; error?: string } {
  try {
    const testPath = path.join(__dirname, testFile)
    log(`\n${colors.bright}🧪 Running: ${testFile}${colors.reset}`)

    const output = execSync(`npx jest "${testPath}" --verbose --no-cache`, {
      encoding: 'utf8',
      cwd: path.join(__dirname, '../..')
    })

    log(`✅ PASSED: ${testFile}`, 'green')
    return { success: true, output }
  } catch (error: any) {
    log(`❌ FAILED: ${testFile}`, 'red')
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message
    }
  }
}

function main() {
  log('\n' + '='.repeat(60), 'cyan')
  log('🚀 AI PHOTOSHOP DIALOG MODE TEST SUITE', 'cyan')
  log('='.repeat(60), 'cyan')

  const results = {
    total: testFiles.length,
    passed: 0,
    failed: 0,
    errors: [] as string[]
  }

  // Run each test file
  for (const testFile of testFiles) {
    const result = runTest(testFile)

    if (result.success) {
      results.passed++
    } else {
      results.failed++
      results.errors.push(`${testFile}: ${result.error || 'Unknown error'}`)
    }

    // Show brief output for each test
    if (result.output) {
      const lines = result.output.split('\n')
      const summaryLines = lines.filter(line =>
        line.includes('PASS') ||
        line.includes('FAIL') ||
        line.includes('Tests:') ||
        line.includes('Snapshots:') ||
        line.includes('Time:')
      )

      summaryLines.forEach(line => {
        if (line.includes('PASS')) {
          log(`  ${line}`, 'green')
        } else if (line.includes('FAIL')) {
          log(`  ${line}`, 'red')
        } else {
          log(`  ${line}`, 'yellow')
        }
      })
    }
  }

  // Final summary
  log('\n' + '='.repeat(60), 'cyan')
  log('📊 TEST SUMMARY', 'cyan')
  log('='.repeat(60), 'cyan')

  log(`Total Tests: ${results.total}`)
  log(`Passed: ${results.passed}`, results.passed > 0 ? 'green' : 'reset')
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'reset')

  if (results.errors.length > 0) {
    log('\n🚨 ERRORS:', 'red')
    results.errors.forEach(error => {
      log(`  - ${error}`, 'red')
    })
  }

  log(`\n${colors.bright}Overall Result: ${results.failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}${colors.reset}`)

  if (results.failed === 0) {
    log('\n🎉 AI Photoshop dialog mode test suite completed successfully!', 'green')
    log('All core functionality, schemas, performance, and regressions are covered.', 'green')
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow')
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

export { runTest, testFiles }