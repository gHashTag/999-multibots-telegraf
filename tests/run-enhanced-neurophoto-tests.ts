/**
 * 🚀 ENHANCED NEUROPHOTO TEST RUNNER
 *
 * Comprehensive test execution orchestrator for multi-image Neurophoto functionality
 * Runs all test suites with detailed reporting and performance metrics
 */

import { execSync } from 'child_process'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

interface TestSuite {
  name: string
  file: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  estimatedTime: number // seconds
  description: string
}

interface TestResult {
  suite: string
  passed: number
  failed: number
  skipped: number
  duration: number
  coverage?: number
  memoryUsage?: number
  errors: string[]
}

interface TestReport {
  timestamp: string
  totalDuration: number
  overallResult: 'PASS' | 'FAIL' | 'PARTIAL'
  suiteResults: TestResult[]
  summary: {
    totalTests: number
    totalPassed: number
    totalFailed: number
    overallCoverage: number
    criticalIssues: string[]
    recommendations: string[]
  }
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'Enhanced Neurophoto Core',
    file: 'neurophoto-enhanced.test.ts',
    priority: 'critical',
    estimatedTime: 120,
    description: 'Core multi-image processing functionality and backward compatibility'
  },
  {
    name: 'Hero Validation Integration',
    file: 'hero-validation-integration.test.ts',
    priority: 'critical',
    estimatedTime: 60,
    description: 'Hero system integration with multi-image processing'
  },
  {
    name: 'Performance & Benchmarks',
    file: 'neurophoto-performance.test.ts',
    priority: 'high',
    estimatedTime: 180,
    description: 'Performance optimization and resource usage validation'
  },
  {
    name: 'Security & Edge Cases',
    file: 'neurophoto-security.test.ts',
    priority: 'critical',
    estimatedTime: 90,
    description: 'Security validation and edge case handling'
  }
]

class NeurophotoTestRunner {
  private results: TestResult[] = []
  private startTime: number = 0
  private reportDir: string

  constructor() {
    this.reportDir = join(process.cwd(), 'tests', 'reports')
    this.ensureReportDirectory()
  }

  private ensureReportDirectory() {
    if (!existsSync(this.reportDir)) {
      mkdirSync(this.reportDir, { recursive: true })
    }
  }

  async runAllTests(): Promise<TestReport> {
    console.log('🚀 Starting Enhanced Neurophoto Test Suite')
    console.log('=' .repeat(60))

    this.startTime = Date.now()

    // Run tests in priority order
    const sortedSuites = TEST_SUITES.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })

    for (const suite of sortedSuites) {
      console.log(`\n🧪 Running: ${suite.name}`)
      console.log(`📋 Description: ${suite.description}`)
      console.log(`⏱️  Estimated time: ${suite.estimatedTime}s`)
      console.log(`🎯 Priority: ${suite.priority.toUpperCase()}`)

      const result = await this.runTestSuite(suite)
      this.results.push(result)

      this.displaySuiteResult(result)

      // Stop on critical failures
      if (suite.priority === 'critical' && result.failed > 0) {
        console.log('❌ Critical test suite failed. Stopping execution.')
        break
      }
    }

    const report = this.generateReport()
    await this.saveReport(report)
    this.displayFinalResults(report)

    return report
  }

  private async runTestSuite(suite: TestSuite): Promise<TestResult> {
    const startTime = Date.now()
    let result: TestResult = {
      suite: suite.name,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      errors: []
    }

    try {
      // Run vitest for the specific test file
      const command = `npm run test:vitest -- ${suite.file} --reporter=json --run`

      const output = execSync(command, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: (suite.estimatedTime + 60) * 1000 // Add 60s buffer
      })

      // Parse vitest JSON output
      const testData = this.parseVitestOutput(output)
      result = {
        ...result,
        ...testData,
        duration: Date.now() - startTime
      }

    } catch (error: any) {
      result.failed = 1
      result.duration = Date.now() - startTime
      result.errors.push(`Test suite execution failed: ${error.message}`)
    }

    return result
  }

  private parseVitestOutput(output: string): Partial<TestResult> {
    try {
      // Parse JSON output from vitest
      const lines = output.split('\n').filter(line => line.trim())
      const jsonLine = lines.find(line => line.startsWith('{'))

      if (jsonLine) {
        const data = JSON.parse(jsonLine)
        return {
          passed: data.numPassedTests || 0,
          failed: data.numFailedTests || 0,
          skipped: data.numPendingTests || 0,
          coverage: data.coverageMap?.pct || 0
        }
      }
    } catch (error) {
      console.warn('Could not parse test output, using fallback parsing')
    }

    // Fallback: parse from text output
    const passed = (output.match(/✓/g) || []).length
    const failed = (output.match(/✗|❌/g) || []).length
    const skipped = (output.match(/○|skipped/g) || []).length

    return { passed, failed, skipped }
  }

  private displaySuiteResult(result: TestResult) {
    const total = result.passed + result.failed + result.skipped
    const passRate = total > 0 ? (result.passed / total * 100).toFixed(1) : '0.0'

    console.log(`\n📊 Results for ${result.suite}:`)
    console.log(`   ✅ Passed: ${result.passed}`)
    console.log(`   ❌ Failed: ${result.failed}`)
    console.log(`   ⏭️  Skipped: ${result.skipped}`)
    console.log(`   📈 Pass Rate: ${passRate}%`)
    console.log(`   ⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`)

    if (result.coverage) {
      console.log(`   🎯 Coverage: ${result.coverage}%`)
    }

    if (result.errors.length > 0) {
      console.log(`   🚨 Errors:`)
      result.errors.forEach(error => console.log(`      - ${error}`))
    }
  }

  private generateReport(): TestReport {
    const endTime = Date.now()
    const totalDuration = endTime - this.startTime

    const summary = this.results.reduce(
      (acc, result) => ({
        totalTests: acc.totalTests + result.passed + result.failed + result.skipped,
        totalPassed: acc.totalPassed + result.passed,
        totalFailed: acc.totalFailed + result.failed,
        totalSkipped: acc.totalSkipped + result.skipped
      }),
      { totalTests: 0, totalPassed: 0, totalFailed: 0, totalSkipped: 0 }
    )

    const overallCoverage = this.results
      .filter(r => r.coverage)
      .reduce((acc, r) => acc + (r.coverage || 0), 0) /
      this.results.filter(r => r.coverage).length || 0

    const criticalIssues = this.identifyCriticalIssues()
    const recommendations = this.generateRecommendations()

    return {
      timestamp: new Date().toISOString(),
      totalDuration: totalDuration / 1000, // Convert to seconds
      overallResult: summary.totalFailed === 0 ? 'PASS' :
        summary.totalPassed > summary.totalFailed ? 'PARTIAL' : 'FAIL',
      suiteResults: this.results,
      summary: {
        ...summary,
        overallCoverage,
        criticalIssues,
        recommendations
      }
    }
  }

  private identifyCriticalIssues(): string[] {
    const issues: string[] = []

    this.results.forEach(result => {
      if (result.failed > 0) {
        const suite = TEST_SUITES.find(s => s.name === result.suite)
        if (suite?.priority === 'critical') {
          issues.push(`Critical failures in ${result.suite}: ${result.failed} tests failed`)
        }
      }

      if (result.coverage && result.coverage < 80) {
        issues.push(`Low coverage in ${result.suite}: ${result.coverage}%`)
      }

      if (result.duration > 300000) { // 5 minutes
        issues.push(`Performance issue in ${result.suite}: ${(result.duration / 1000).toFixed(1)}s`)
      }
    })

    return issues
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = []

    const failedSuites = this.results.filter(r => r.failed > 0)
    const lowCoverageSuites = this.results.filter(r => r.coverage && r.coverage < 90)
    const slowSuites = this.results.filter(r => r.duration > 180000)

    if (failedSuites.length > 0) {
      recommendations.push('🔧 Address failing tests before deployment')
      recommendations.push('🐛 Review error logs for root cause analysis')
    }

    if (lowCoverageSuites.length > 0) {
      recommendations.push('📈 Improve test coverage in: ' +
        lowCoverageSuites.map(s => s.suite).join(', '))
    }

    if (slowSuites.length > 0) {
      recommendations.push('⚡ Optimize performance tests in: ' +
        slowSuites.map(s => s.suite).join(', '))
    }

    const totalMemoryUsage = this.results.reduce((acc, r) => acc + (r.memoryUsage || 0), 0)
    if (totalMemoryUsage > 500 * 1024 * 1024) { // 500MB
      recommendations.push('💾 Consider memory optimization for large test suites')
    }

    if (recommendations.length === 0) {
      recommendations.push('✨ All tests passing! Consider adding more edge cases')
      recommendations.push('🚀 Ready for production deployment')
    }

    return recommendations
  }

  private async saveReport(report: TestReport) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `neurophoto-test-report-${timestamp}.json`
    const filePath = join(this.reportDir, fileName)

    writeFileSync(filePath, JSON.stringify(report, null, 2))

    // Also save a latest report
    const latestPath = join(this.reportDir, 'neurophoto-latest-report.json')
    writeFileSync(latestPath, JSON.stringify(report, null, 2))

    console.log(`\n📄 Report saved to: ${filePath}`)
  }

  private displayFinalResults(report: TestReport) {
    console.log('\n' + '='.repeat(60))
    console.log('🏁 ENHANCED NEUROPHOTO TEST SUITE - FINAL RESULTS')
    console.log('='.repeat(60))

    const { summary } = report
    const passRate = summary.totalTests > 0 ?
      (summary.totalPassed / summary.totalTests * 100).toFixed(1) : '0.0'

    console.log(`\n📊 Overall Statistics:`)
    console.log(`   🧪 Total Tests: ${summary.totalTests}`)
    console.log(`   ✅ Passed: ${summary.totalPassed}`)
    console.log(`   ❌ Failed: ${summary.totalFailed}`)
    console.log(`   📈 Pass Rate: ${passRate}%`)
    console.log(`   ⏱️  Total Duration: ${report.totalDuration.toFixed(2)}s`)
    console.log(`   🎯 Coverage: ${summary.overallCoverage.toFixed(1)}%`)

    console.log(`\n🎯 Result: ${this.getResultEmoji(report.overallResult)} ${report.overallResult}`)

    if (summary.criticalIssues.length > 0) {
      console.log(`\n🚨 Critical Issues:`)
      summary.criticalIssues.forEach(issue => console.log(`   • ${issue}`))
    }

    if (summary.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`)
      summary.recommendations.forEach(rec => console.log(`   • ${rec}`))
    }

    console.log('\n' + '='.repeat(60))
  }

  private getResultEmoji(result: TestReport['overallResult']): string {
    switch (result) {
      case 'PASS': return '🎉'
      case 'PARTIAL': return '⚠️'
      case 'FAIL': return '❌'
      default: return '❓'
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2)
  const runner = new NeurophotoTestRunner()

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🧪 Enhanced Neurophoto Test Runner

Usage: npm run test:enhanced-neurophoto [options]

Options:
  --help, -h          Show this help message
  --suite <name>      Run specific test suite only
  --priority <level>  Run only tests of specified priority (critical, high, medium, low)
  --coverage          Include coverage analysis
  --performance       Focus on performance tests only

Examples:
  npm run test:enhanced-neurophoto
  npm run test:enhanced-neurophoto --suite "Enhanced Neurophoto Core"
  npm run test:enhanced-neurophoto --priority critical
  npm run test:enhanced-neurophoto --performance
`)
    process.exit(0)
  }

  try {
    const report = await runner.runAllTests()

    // Exit with appropriate code
    const exitCode = report.overallResult === 'PASS' ? 0 :
      report.overallResult === 'PARTIAL' ? 1 : 2

    process.exit(exitCode)
  } catch (error) {
    console.error('❌ Test runner failed:', error)
    process.exit(3)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

export { NeurophotoTestRunner, TestSuite, TestResult, TestReport }